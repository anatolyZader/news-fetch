#!/usr/bin/env node
/**
 * Run municipal PBO completeness review for one date (pipeline / cron / slash).
 *
 * Usage:
 *   node runMunicipalPboReview.js --date YYYY-MM-DD|dd:mm:yyyy [--export-batch] [--out path]
 */
import 'dotenv/config';
import { runMunicipalPboReviewCli } from '../app/runMunicipalPboReviewCli.js';

try {
  const code = await runMunicipalPboReviewCli(process.argv.slice(2));
  process.exit(code);
} catch (err) {
  console.error('runMunicipalPboReview failed:', err.message);
  process.exit(1);
}
