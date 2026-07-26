#!/usr/bin/env node
/**
 * Stage-1 CLI application logic: extract behavioral signals from one source type
 * and persist JSON artifacts (closed signals bundle; optional parallel open
 * observations).
 *
 * Pipeline position: called from input/extract-signals.js. Loads markdown →
 * archives sources → runExtractionStage (closed + optional open) → cost log.
 * Run once per source type; then assess-signals combines bundles.
 *
 * Owns: CLI arg parsing/validation, budget check, article load, archival,
 * orchestration into extractionStageRunner, story-cluster indexing, cost log.
 * Does NOT: implement LLM prompts (claudeExtraction / closedCatalogueExtract)
 * or assess components.
 *
 * Usage:
 *   node extract-signals.js --source-type news|radio|visits|whatsapp --files <f1.md,f2.md,...> --date YYYY-MM-DD
 *
 * Output:
 *   business_modules/resilience_scorer/data/signals/signals-{source-type}-{date}.json  (news, radio, whatsapp, …)
 *   business_modules/visits/data/signals/signals-visits-{date}.json  (visits)
 *   business_modules/open_observation_extraction/data/observations-pipeline-{source-type}-{date}.json  (parallel open, default ON)
 */

import 'dotenv/config';
import { existsSync } from 'node:fs';
import { resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadMdFiles } from '../../infrastructure/mdReportsLoader.js';
import { createCostTracker, appendCostLog, checkDailyBudget } from '../../../../cross-cut-modules/budget/index.js';
import { createRunTrace } from '../../../../cross-cut-modules/log/index.js';
import { archiveMarkdownFiles } from './archiveMarkdownFromMd.js';
import { attachSourceIdsToArticles } from '../../../../db/source_archive/attachSourceIds.js';
import { createRetrievalService } from '../../../../cross-cut-modules/retrieval/createRetrievalService.js';
import { resolveSqlitePath } from '../../../../cross-cut-modules/config/sqlitePath.js';
import {
  runExtractionStage,
  indexExtractStoryClusters,
} from './extractionStageRunner.js';
import { CONTENT_KIND } from './contentKinds.js';
import { getArg } from '../cliArgs.js';
import {
  normalizePipelineSourceKey,
} from '../../domain/services/signals/visitsSourceType.js';
import { loadPipelineConfig } from '../../domain/services/paths/signalBundles.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Honor pipeline-config.json enabledSources (legacy `field` keys normalize to visits). */
function isSourceEnabled(sourceType) {
  const { enabledSources } = loadPipelineConfig(resolve('pipeline-config.json'));
  if (!enabledSources) return true;
  const canonical = normalizePipelineSourceKey(sourceType);
  for (const s of enabledSources) {
    if (normalizePipelineSourceKey(s) === canonical) return true;
  }
  return false;
}

/** Parse --source-type / --files / --date from argv. */
function parseExtractCliArgs(argv) {
  return {
    sourceType: getArg(argv, '--source-type'),
    filesArg: getArg(argv, '--files'),
    date: getArg(argv, '--date') ?? new Date().toISOString().slice(0, 10),
  };
}

/** Validate required args, enabled source, and ANTHROPIC_API_KEY; exit on failure. */
function exitIfInvalidExtractCli({ sourceType, filesArg }) {
  if (!sourceType || !CONTENT_KIND[sourceType]) {
    console.error('Usage: extract-signals.js --source-type news|radio|visits|whatsapp --files <csv> --date YYYY-MM-DD');
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
  if (!process.env.ANTHROPIC_API_KEY && process.env.LLM_TRANSPORT !== 'claude-cli') {
    console.error('Error: ANTHROPIC_API_KEY is not set (or use LLM_TRANSPORT=claude-cli)');
    process.exit(1);
  }
}

/** Resolve comma-separated --files to absolute paths; exit if any missing. */
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

/**
 * Archive original markdown into the source archive / RAG index.
 * Failures are logged and non-fatal (extraction still proceeds).
 * @returns {Promise<object|null>} retrievalService for later indexing/close
 */
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

/**
 * CLI entry used by input/extract-signals.js.
 * Side effects: reads files, LLM extract, writes signal/observation JSON, cost log.
 * @returns {Promise<void>}
 */
export async function runExtractSignalsCli() {
  const cli = parseExtractCliArgs(process.argv.slice(2));
  exitIfInvalidExtractCli(cli);
  const { sourceType, filesArg, date } = cli;

  checkDailyBudget();
  const contentKind = CONTENT_KIND[sourceType];
  const filePaths = resolveExtractFilePaths(filesArg);

  const { onUsage, getTotal } = createCostTracker({ label: 'extract-signals' });
  const sqlitePath = resolveSqlitePath(process.env, REPO_ROOT);
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

  const { signals } = await runExtractionStage({
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
