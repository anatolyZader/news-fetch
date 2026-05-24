#!/usr/bin/env node
/**
 * Generate a catalog gap report from learning-capture JSONL files.
 *
 * Usage:
 *   node business_modules/catalogLearning/input/generate-gap-report.js [reportsDir] [--days 14] [--out reports/catalog-gap-report.md]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { catalogLearningService } from '../app/catalogLearningService.js';
import { learningCaptureFsAdapter } from '../infrastructure/adapters/learningCaptureFsAdapter.js';

function parseArgs(argv) {
  const positional = [];
  let days = 14;
  let out = 'reports/catalog-gap-report.md';
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
    reportsDir: positional[0] ?? 'reports',
    days,
    out,
    topN,
  };
}

async function main() {
  const { reportsDir, days, out, topN } = parseArgs(process.argv.slice(2));
  const service = new catalogLearningService({
    capturePort: new learningCaptureFsAdapter({ reportsDir }),
  });

  const markdown = await service.generateGapReportMarkdown({ maxDays: days, topN });
  const outPath = resolve(out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, markdown, 'utf8');

  console.log(`Catalog gap report written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
