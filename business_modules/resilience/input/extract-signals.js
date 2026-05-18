#!/usr/bin/env node
/**
 * Stage-1 CLI: extract behavioral signals from one source type and persist JSON artifacts
 * (root `signals/` for most sources; visits module for `field`).
 * Run this separately for each source type; then run assess-signals.js to combine and assess.
 *
 * Usage:
 *   node extract-signals.js --source-type news|radio|field|whatsapp --files <f1.md,f2.md,...> --date YYYY-MM-DD
 *
 * Output:
 *   signals/signals-{source-type}-{date}.json  (news, radio, whatsapp, …)
 *   business_modules/visits/data/signals/signals-field-{date}.json  (field)
 */

import 'dotenv/config';
import { resolve, basename, dirname } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

import { loadMdFiles } from '../infrastructure/mdReportsLoader.js';
import { extractSignals } from '../infrastructure/claudeEvaluator.js';
import { createCostTracker, appendCostLog, checkDailyBudget } from '../../../cross-cut-modules/budget/index.js';
import { createGeoWiring } from '../../../cross-cut-modules/geo/createGeoWiring.js';
import { attachGeoToSignals } from '../../../cross-cut-modules/geo/attachGeoToSignals.js';
import { buildReferenceNameIndex } from '../../../cross-cut-modules/geo/referenceNameIndex.js';

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
    return !entry || entry.enabled !== false;
  } catch {
    return true;
  }
}

async function run() {
  const args = process.argv.slice(2);
  const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

  const sourceType = getArg('--source-type');
  const filesArg   = getArg('--files');
  const date       = getArg('--date') ?? new Date().toISOString().slice(0, 10);

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

  checkDailyBudget();

  const contentKind = CONTENT_KIND[sourceType];
  const filePaths = filesArg.split(',').map((f) => resolve(f.trim()));

  for (const fp of filePaths) {
    if (!existsSync(fp)) {
      console.error(`File not found: ${fp}`);
      process.exit(1);
    }
  }

  const { onUsage, getTotal } = createCostTracker({ label: 'extract-signals' });
  const { articles } = loadMdFiles(filePaths, { dayOffsets: filePaths.map(() => 0) });

  console.error(`\nSignal Extraction  source=${sourceType}  kind=${contentKind}`);
  console.error(`===================`);
  console.error(`Files: ${filePaths.map((f) => basename(f)).join(', ')}`);
  console.error(`Articles loaded: ${articles.length}\n`);

  const rawSignals = await extractSignals(articles, { onUsage, contentKind });

  // Tag every signal with its source type so assess-signals can split them later
  let signals = rawSignals.map((s) => ({ ...s, source_type: sourceType }));

  if (
    process.env.GEO_ATTACH_ON_EXTRACT === '1' &&
    (sourceType === 'news' || sourceType === 'radio')
  ) {
    const { geoEnrichmentPort } = createGeoWiring({
      rootDir: REPO_ROOT,
      unknownSourceType: `extract-${sourceType}`,
    });
    const nameIndex = buildReferenceNameIndex(REPO_ROOT);
    const { signals: withGeo, attached, resolved, unknown } = attachGeoToSignals(signals, geoEnrichmentPort, {
      sourceType,
      nameIndex,
    });
    signals = withGeo;
    console.error(`  → Geo attach: ${attached} signals, ${resolved} resolved, ${unknown} unknown`);
  }

  console.error(`\n→ ${signals.length} signals extracted`);

  const outDir =
    sourceType === 'field'
      ? resolve('business_modules', 'visits', 'data', 'signals')
      : resolve('signals');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `signals-${sourceType}-${date}.json`);

  writeFileSync(
    outPath,
    JSON.stringify(
      {
        source_type: sourceType,
        content_kind: contentKind,
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

  const { totalCostUsd, usageLog, stageEvents } = getTotal();
  appendCostLog({ script: 'extract-signals', date, totalCostUsd, usageLog, stageEvents, articles: articles.length });
}

run().catch((err) => {
  console.error('extract-signals failed:', err.message);
  process.exit(1);
});
