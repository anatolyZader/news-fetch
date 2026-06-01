#!/usr/bin/env node
/**
 * Regenerate operator -brief.md from existing report JSON files.
 *
 *   npm run backfill:report-brief
 *   node business_modules/resilience/input/backfillReportBriefMd.js --force
 *   node business_modules/resilience/input/backfillReportBriefMd.js --all-scopes
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildMarkdown, buildSignalAppendix } from '../infrastructure/reportWriter.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const reportsDir = resolve(root, 'daily_reports');
const force = process.argv.includes('--force');
const allScopes = process.argv.includes('--all-scopes');

let written = 0;
let skipped = 0;

for (const name of readdirSync(reportsDir).sort()) {
  if (!name.endsWith('.json')) continue;
  if (!name.startsWith('resilience-report')) continue;
  if (!allScopes && name.includes('-north-')) continue;

  const jsonPath = join(reportsDir, name);
  const briefPath = jsonPath.replace(/\.json$/i, '-brief.md');
  if (!force && existsSync(briefPath)) {
    try {
      if (statSync(briefPath).mtimeMs >= statSync(jsonPath).mtimeMs) {
        skipped += 1;
        continue;
      }
    } catch { /* regenerate */ }
  }

  let payload;
  try {
    payload = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch (err) {
    console.error(`skip ${name}: ${err.message}`);
    continue;
  }
  const assessment = payload.assessment;
  if (!assessment) {
    console.error(`skip ${name}: no assessment`);
    continue;
  }
  const sourceFiles = payload.source_files ?? [];
  const signals = payload.signals ?? [];
  const md = buildMarkdown(assessment, sourceFiles, { includeScores: false })
    + buildSignalAppendix(signals);
  writeFileSync(briefPath, md, 'utf8');
  written += 1;
  console.error(`wrote ${briefPath}`);
}

console.error(`done: ${written} written, ${skipped} skipped`);
