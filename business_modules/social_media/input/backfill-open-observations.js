#!/usr/bin/env node
/**
 * Backfill pipeline open observations from an existing social signals bundle (no re-gather).
 *
 * Usage:
 *   node backfill-open-observations.js --date YYYY-MM-DD
 */
import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { socialFindingsToExtractUnits } from '../index.js';
import { runPipelineOpenExtract } from '../../signals_extraction/index.js';
import { createCostTracker } from '../../../cross-cut-modules/budget/index.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function getArg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const date = getArg('--date');
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('Usage: backfill-open-observations.js --date YYYY-MM-DD');
  process.exit(1);
}

const bundlePath = resolve(REPO_ROOT, 'business_modules/social_media/data', `signals-social-${date}.json`);
if (!existsSync(bundlePath)) {
  console.error(`Social bundle not found: ${bundlePath}`);
  process.exit(1);
}

let bundle;
try {
  bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
} catch (err) {
  console.error(`Could not read social bundle: ${err.message}`);
  process.exit(1);
}

const findings = bundle.findings ?? bundle.signals ?? [];
const units = socialFindingsToExtractUnits(findings);
if (!units.length) {
  console.error(`No extract units from ${bundlePath}`);
  process.exit(0);
}

const { onUsage } = createCostTracker({ label: 'extract-open-social' });
await runPipelineOpenExtract({
  articles: units,
  sourceType: 'social',
  contentKind: 'mixed',
  date,
  sourceFiles: [bundlePath],
  onUsage,
});
