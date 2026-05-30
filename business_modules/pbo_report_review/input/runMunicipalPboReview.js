#!/usr/bin/env node
/**
 * Run municipal PBO completeness review for one date (pipeline / cron).
 *
 * Usage:
 *   node runMunicipalPboReview.js --date YYYY-MM-DD [--force] [--dry-run]
 */
import 'dotenv/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDefaultPboReportReviewService } from './createPboReviewWiring.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function parseArgs(argv) {
  const getArg = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : null;
  };
  return {
    date: getArg('--date') ?? new Date().toISOString().slice(0, 10),
    force: argv.includes('--force'),
    dryRun: argv.includes('--dry-run'),
  };
}

const { date, force, dryRun } = parseArgs(process.argv.slice(2));
const sqlitePath = process.env.SQLITE_PATH?.trim()
  ? resolve(process.env.SQLITE_PATH.trim())
  : resolve(repoRoot, 'db', 'app.sqlite');

try {
  const service = createDefaultPboReportReviewService({ repoRoot, sqlitePath });
  const result = await service.reviewDay(date, { force, dryRun });
  console.error(JSON.stringify(result, null, 2));
  if (result.skipped) process.exit(0);
  const failed = (result.results ?? []).filter((r) => r.emailError);
  process.exit(failed.length ? 1 : 0);
} catch (err) {
  console.error('runMunicipalPboReview failed:', err.message);
  process.exit(1);
}
