#!/usr/bin/env node
/**
 * Stage-1 CLI: extract behavioral signals from one source type and persist JSON artifacts
 * (signals_extraction module data for most sources; visits module for `field`).
 * Run this separately for each source type; then run assess-signals.js to combine and assess.
 *
 * Usage:
 *   node extract-signals.js --source-type news|radio|visits|field|whatsapp --files <f1.md,f2.md,...> --date YYYY-MM-DD
 *
 * Output:
 *   business_modules/signals_extraction/data/signals/signals-{source-type}-{date}.json  (news, radio, whatsapp, …)
 *   business_modules/visits/data/signals/signals-field-{date}.json  (visits / legacy field)
 *   business_modules/signals_extraction/data/observations-pipeline-{source-type}-{date}.json  (parallel open, default ON)
 */

import 'dotenv/config';
import { resolve, basename, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadMdFiles } from '../infrastructure/mdReportsLoader.js';
import { createCostTracker, appendCostLog, checkDailyBudget } from '../../../cross-cut-modules/budget/index.js';
import { createRunTrace } from '../../../cross-cut-modules/log/index.js';
import { archiveMarkdownFiles } from '../app/archiveMarkdownFromMd.js';
import { attachSourceIdsToArticles } from '../../../db/source_archive/attachSourceIds.js';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';
import {
  runArticleDualPathExtract,
  indexExtractStoryClusters,
} from '../app/articleDualPathExtractService.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const CONTENT_KIND = {
  news: 'news',
  radio: 'audio',
  field: 'field_report',
  visits: 'field_report',
  whatsapp: 'whatsapp',
};

function normalizeExtractSourceType(sourceType) {
  if (sourceType === 'field') return 'visits';
  return sourceType;
}

function isSourceEnabled(sourceType) {
  const cfgPath = resolve('pipeline-config.json');
  if (!existsSync(cfgPath)) return true;
  try {
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    const key = sourceType === 'visits' ? 'visits' : sourceType;
    const entry = cfg?.sources?.[key] ?? cfg?.sources?.field;
    return entry?.enabled !== false;
  } catch {
    return true;
  }
}

function parseExtractCliArgs(argv) {
  const getArg = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : null;
  };
  return {
    sourceType: getArg('--source-type'),
    filesArg: getArg('--files'),
    date: getArg('--date') ?? new Date().toISOString().slice(0, 10),
  };
}

function exitIfInvalidExtractCli({ sourceType, filesArg }) {
  const canonical = normalizeExtractSourceType(sourceType);
  if (!sourceType || !CONTENT_KIND[canonical]) {
    console.error('Usage: extract-signals.js --source-type news|radio|visits|field|whatsapp --files <csv> --date YYYY-MM-DD');
    process.exit(1);
  }
  if (!filesArg) {
    console.error('Error: --files is required');
    process.exit(1);
  }
  if (!isSourceEnabled(canonical)) {
    console.log(`  ℹ Source "${canonical}" is disabled in pipeline-config.json — skipping extraction.`);
    process.exit(0);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set');
    process.exit(1);
  }
}

function resolveExtractFilePaths(filesArg) {
  const filePaths = filesArg.split(',').map((f) => resolve(f.trim()));
  for (const fp of filePaths) {
    if (!existsSync(fp)) {
      console.error(`File not found: ${fp}`);
      process.exit(1);
    }
  }
  return filePaths;
}

async function archiveExtractSources(filePaths, { date, sourceType, sqlitePath, onUsage }) {
  let retrievalService = null;
  try {
    retrievalService = createRetrievalService({ dbPath: sqlitePath, onUsage: onUsage ?? null });
    const n = await archiveMarkdownFiles(filePaths, {
      date,
      source_type: sourceType,
      repoRoot: REPO_ROOT,
      sqlitePath,
      retrievalIndexer: retrievalService,
    });
    console.error(`  → ${n} original(s) archived for ${date}`);
  } catch (err) {
    console.error(`  ⚠ Source archive skipped: ${err.message}`);
  }
  return retrievalService;
}

export async function runExtractSignalsCli() {
  const cli = parseExtractCliArgs(process.argv.slice(2));
  exitIfInvalidExtractCli(cli);
  const sourceType = normalizeExtractSourceType(cli.sourceType);
  const { filesArg, date } = cli;

  checkDailyBudget();
  const contentKind = CONTENT_KIND[sourceType];
  const filePaths = resolveExtractFilePaths(filesArg);

  const { onUsage, getTotal } = createCostTracker({ label: 'extract-signals' });
  const sqlitePath = process.env.SQLITE_PATH?.trim() || resolve(REPO_ROOT, 'db', 'app.sqlite');
  const retrievalService = await archiveExtractSources(filePaths, {
    date,
    sourceType,
    sqlitePath,
    onUsage,
  });

  let articles = loadMdFiles(filePaths, { dayOffsets: filePaths.map(() => 0) }).articles;
  articles = attachSourceIdsToArticles(articles, filePaths, REPO_ROOT);

  console.error(`\nSignal Extraction  source=${sourceType}  kind=${contentKind}`);
  console.error(`===================`);
  console.error(`Files: ${filePaths.map((f) => basename(f)).join(', ')}`);
  console.error(`Articles loaded: ${articles.length}\n`);

  const trace = createRunTrace({
    run: 'extract',
    sourceType,
    date,
    enabled: process.env.RESILIENCE_ITEM_TRACE !== '0',
  });

  const { signals } = await runArticleDualPathExtract({
    repoRoot: REPO_ROOT,
    articles,
    sourceType,
    contentKind,
    date,
    filePaths,
    onUsage,
    retrievalService,
    trace,
  });

  const traceOut = trace.finish();
  if (traceOut) {
    console.error(`\nDecision trace written:\n  ${traceOut.mdPath}`);
  }

  await indexExtractStoryClusters(retrievalService, signals);
  retrievalService?.close();

  const { totalCostUsd, usageLog, stageEvents } = getTotal();
  appendCostLog({ script: 'extract-signals', date, totalCostUsd, usageLog, stageEvents, articles: articles.length });
}
