import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildMarkdown, buildSignalAppendix } from '../infrastructure/reportWriter.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const reportsDir = resolve(root, 'daily_reports');

function shouldSkipBrief(jsonPath, briefPath, force) {
  if (force || !existsSync(briefPath)) return false;
  try {
    return statSync(briefPath).mtimeMs >= statSync(jsonPath).mtimeMs;
  } catch {
    return false;
  }
}

function processReportJson(name, force) {
  const jsonPath = resolve(reportsDir, name);
  const briefPath = jsonPath.replace(/\.json$/i, '-brief.md');
  if (shouldSkipBrief(jsonPath, briefPath, force)) {
    return 'skipped';
  }

  let payload;
  try {
    payload = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch (err) {
    console.error(`skip ${name}: ${err.message}`);
    return 'error';
  }

  const assessment = payload.assessment;
  if (!assessment) {
    console.error(`skip ${name}: no assessment`);
    return 'error';
  }

  const sourceFiles = payload.source_files ?? [];
  const signals = payload.signals ?? [];
  const md = buildMarkdown(assessment, sourceFiles, { includeScores: false })
    + buildSignalAppendix(signals);
  writeFileSync(briefPath, md, 'utf8');
  console.error(`wrote ${briefPath}`);
  return 'written';
}

/**
 * @param {string[]} [argv]
 */
export function runBackfillReportBriefMdCli(argv = process.argv.slice(2)) {
  const force = argv.includes('--force');
  const allScopes = argv.includes('--all-scopes');

  let written = 0;
  let skipped = 0;

  for (const name of readdirSync(reportsDir).sort((a, b) => a.localeCompare(b))) {
    if (!name.endsWith('.json')) continue;
    if (!name.startsWith('resilience-report')) continue;
    if (!allScopes && name.includes('-north-')) continue;

    const outcome = processReportJson(name, force);
    if (outcome === 'written') written += 1;
    if (outcome === 'skipped') skipped += 1;
  }

  console.error(`done: ${written} written, ${skipped} skipped`);
}
