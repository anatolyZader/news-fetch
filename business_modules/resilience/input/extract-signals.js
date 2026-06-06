#!/usr/bin/env node
/**
 * Stage-1 CLI: extract behavioral signals from one source type and persist JSON artifacts
 * (signals_extraction module data for most sources; visits module for `field`).
 * Run this separately for each source type; then run assess-signals.js to combine and assess.
 *
 * Usage:
 *   node extract-signals.js --source-type news|radio|field|whatsapp --files <f1.md,f2.md,...> --date YYYY-MM-DD
 *
 * Output:
 *   business_modules/signals_extraction/data/signals/signals-{source-type}-{date}.json  (news, radio, whatsapp, …)
 *   business_modules/visits/data/signals/signals-field-{date}.json  (field)
 */

import 'dotenv/config';
import { resolve, basename, dirname } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadMdFiles } from '../infrastructure/mdReportsLoader.js';
import { extractSignals } from '../infrastructure/claudeEvaluator.js';
import { createCostTracker, appendCostLog, checkDailyBudget } from '../../../cross-cut-modules/budget/index.js';
import { enrichSignalsWithGeo } from '../../../cross-cut-modules/geo/enrichSignalsWithGeo.js';
import { archiveMarkdownFiles } from '../app/archiveMarkdownFromMd.js';
import { attachSourceIdsToSignals, attachSourceIdsToArticles } from '../../../db/source_archive/attachSourceIds.js';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';
import { defaultClosedSignalsDir } from '../../signals_extraction/infrastructure/signalsDataPaths.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const CONTENT_KIND = { news: 'news', radio: 'audio', field: 'field_report', whatsapp: 'whatsapp' };

/**
 * C1 — honour `pipeline-config.json` at extract-time.
 * `assess-signals.js` already skips disabled sources at assessment time, but
 * extraction itself (which is where the LLM cost is incurred) ignored the
 * config and would gladly burn tokens for sources the operator turned off.
 * Returns true when `sourceType` is enabled (or no config file is present).
 */
function isSourceEnabled(sourceType) {
  const cfgPath = resolve('pipeline-config.json');
  if (!existsSync(cfgPath)) return true;
  try {
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    const entry = cfg?.sources?.[sourceType];
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
  if (!sourceType || !CONTENT_KIND[sourceType]) {
    console.error('Usage: extract-signals.js --source-type news|radio|field|whatsapp --files <csv> --date YYYY-MM-DD');
    process.exit(1);
  }
  if (!filesArg) {
    console.error('Error: --files is required');
    process.exit(1);
  }
  if (!isSourceEnabled(sourceType)) {
    console.log(`  ℹ Source "${sourceType}" is disabled in pipeline-config.json — skipping extraction.`);
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

async function enrichExtractedSignals(rawSignals, sourceType, filePaths) {
  let signals = rawSignals.map((s) => ({ ...s, source_type: sourceType }));
  const { signals: withGeo, attached, resolved, unknown } = enrichSignalsWithGeo(signals, {
    rootDir: REPO_ROOT,
    unknownSourceType: `extract-${sourceType}`,
  });
  signals = withGeo;
  if (attached > 0) {
    console.error(`  → Geo attach: ${attached} signals, ${resolved} resolved, ${unknown} unknown`);
  }
  signals = attachSourceIdsToSignals(signals, filePaths, REPO_ROOT);
  const bundleDistrictId = sourceType === 'field' || sourceType === 'whatsapp' ? 'north' : null;
  if (bundleDistrictId) {
    signals = signals.map((s) => ({ ...s, district_id: bundleDistrictId }));
  }
  return { signals, bundleDistrictId };
}

function writeSignalsBundle({ sourceType, contentKind, date, filePaths, articles, signals, bundleDistrictId }) {
  const outDir = sourceType === 'field'
    ? resolve('business_modules', 'visits', 'data', 'signals')
    : defaultClosedSignalsDir();
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `signals-${sourceType}-${date}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        source_type: sourceType,
        content_kind: contentKind,
        ...(bundleDistrictId ? { district_id: bundleDistrictId } : {}),
        date,
        extracted_at: new Date().toISOString(),
        source_files: filePaths.map((f) => basename(f)),
        total_articles: articles.length,
        signals,
      },
      null,
      2,
    ),
    'utf-8',
  );
  console.error(`\nSignal file written: ${outPath}`);
  return outPath;
}

async function indexStoryClusters(retrievalService, signals) {
  if (!retrievalService?.storyClusterIndex) return;
  try {
    const { indexed } = await retrievalService.storyClusterIndex.upsertSignals(signals);
    if (indexed > 0) console.error(`  → Story cluster index: ${indexed} evidence span(s)`);
  } catch (err) {
    console.error(`  ⚠ Story cluster index skipped: ${err.message}`);
  }
}

async function run() {
  const cli = parseExtractCliArgs(process.argv.slice(2));
  exitIfInvalidExtractCli(cli);
  const { sourceType, filesArg, date } = cli;

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

  const rawSignals = await extractSignals(articles, {
    onUsage,
    contentKind,
    retrievalService,
    reportDate: date,
  });

  const { signals, bundleDistrictId } = await enrichExtractedSignals(rawSignals, sourceType, filePaths);
  console.error(`\n→ ${signals.length} signals extracted`);
  writeSignalsBundle({ sourceType, contentKind, date, filePaths, articles, signals, bundleDistrictId });
  await indexStoryClusters(retrievalService, signals);
  retrievalService?.close();

  const { totalCostUsd, usageLog, stageEvents } = getTotal();
  appendCostLog({ script: 'extract-signals', date, totalCostUsd, usageLog, stageEvents, articles: articles.length });
}

try {
  await run();
} catch (err) {
  console.error('extract-signals failed:', err.message);
  process.exit(1);
}
