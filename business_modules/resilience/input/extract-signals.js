#!/usr/bin/env node
/**
 * Stage-1 CLI: extract behavioral signals from one source type and persist JSON artifacts
 * (root `signals/` for most sources; visits module for `field`).
 * Run this separately for each source type; then run assess-signals.js to combine and assess.
 *
 * Usage:
 *   node extract-signals.js --source-type news|radio|field --files <f1.md,f2.md,...> --date YYYY-MM-DD
 *
 * Output:
 *   signals/signals-{source-type}-{date}.json  (news, radio, whatsapp, …)
 *   business_modules/visits/data/signals/signals-field-{date}.json  (field)
 */

import 'dotenv/config';
import { resolve, basename } from 'path';
import { existsSync, writeFileSync, mkdirSync } from 'fs';

import { loadMdFiles } from '../infrastructure/mdReportsLoader.js';
import { extractSignals } from '../infrastructure/claudeEvaluator.js';
import { createCostTracker, appendCostLog, checkDailyBudget } from '../../../cross-cut-modules/budget/index.js';

const CONTENT_KIND = { news: 'news', radio: 'audio', field: 'field_report', whatsapp: 'whatsapp' };

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
  const signals = rawSignals.map((s) => ({ ...s, source_type: sourceType }));

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

  const { totalCostUsd, usageLog } = getTotal();
  appendCostLog({ script: 'extract-signals', date, totalCostUsd, usageLog, articles: articles.length });
}

run().catch((err) => {
  console.error('extract-signals failed:', err.message);
  process.exit(1);
});
