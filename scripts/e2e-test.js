#!/usr/bin/env node
/**
 * Smoke test for the production pipeline: extract-signals → assess-signals.
 * Requires ANTHROPIC_API_KEY and articles-homefront.md (run homefront-to-md first).
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { getCachedReport } from '../api/analysisService.js';

const newsFile = resolve('business_modules/news-sites/articles_extracted/articles-homefront.md');
const today = new Date().toISOString().slice(0, 10);

console.log('=== E2E test: extract-signals → assess-signals ===');

if (!process.env.ANTHROPIC_API_KEY?.trim()) {
  console.error('SKIP: ANTHROPIC_API_KEY not set');
  process.exit(0);
}

if (!existsSync(newsFile)) {
  console.error(`SKIP: ${newsFile} not found — run npm run homefront-to-md first`);
  process.exit(0);
}

console.log(`Extracting signals from ${newsFile}...`);
execSync(
  `node business_modules/resilience/input/extract-signals.js --source-type news --files ${newsFile} --date ${today}`,
  { stdio: 'inherit' },
);

console.log(`Assessing signals for ${today}...`);
execSync(
  `node business_modules/resilience/input/assess-signals.js --date ${today} --days 1 --scope national`,
  { stdio: 'inherit' },
);

const cached = getCachedReport(null, { scope: 'national' });
if (!cached?.assessment) {
  console.error('NO report found after assess-signals');
  process.exit(1);
}

const assessment = cached.assessment;
console.log(`\n✅ Pipeline complete for ${cached.reportDate ?? today}`);
console.log(`Overall score: ${assessment.overallScore ?? assessment.overall_score}`);
(assessment.components ?? []).forEach((c) => {
  console.log(`  ${c.id || c.name}: ${c.score}`);
});
