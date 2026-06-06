#!/usr/bin/env node
/**
 * Generate a catalog gap report from learning-capture JSONL files.
 *
 * Usage:
 *   node business_modules/signal_catalog_evolution/input/generate-gap-report.js [reportsDir] [--days 14] [--out daily_reports/catalog-gap-report.md]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { SignalCatalogEvolutionService } from '../app/signalCatalogEvolutionService.js';
import { createDefaultLearningCapturePort } from '../infrastructure/createLearningCapturePort.js';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function parseArgs(argv) {
  const positional = [];
  let days = 14;
  let out = 'daily_reports/catalog-gap-report.md';
  let topN = 15;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--days' && argv[i + 1]) {
      days = Number.parseInt(argv[++i], 10) || 14;
    } else if (arg === '--out' && argv[i + 1]) {
      out = argv[++i];
    } else if (arg === '--top' && argv[i + 1]) {
      topN = Number.parseInt(argv[++i], 10) || 15;
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }

  return {
    reportsDir: positional[0] ?? 'daily_reports',
    days,
    out,
    topN,
  };
}

async function main() {
  const { reportsDir, days, out, topN } = parseArgs(process.argv.slice(2));
  const service = new SignalCatalogEvolutionService({
    capturePort: createDefaultLearningCapturePort({ reportsDir }),
  });

  const sqlitePath = process.env.SQLITE_PATH?.trim() || resolve(REPO_ROOT, 'db', 'app.sqlite');
  let retrieval = null;
  try {
    const svc = createRetrievalService({ dbPath: sqlitePath });
    retrieval = svc.retrieval;
    await svc.catalogIndexWriter.reindexCatalog();
    svc.rebuildFts();
    svc.close();
  } catch (err) {
    console.error(`  ⚠ Catalog RAG index skipped: ${err.message}`);
  }

  const markdown = await service.generateGapReportMarkdown({ maxDays: days, topN, retrieval });
  const outPath = resolve(out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, markdown, 'utf8');

  console.log(`Catalog gap report written to ${outPath}`);
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
