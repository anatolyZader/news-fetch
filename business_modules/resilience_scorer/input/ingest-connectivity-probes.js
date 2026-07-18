#!/usr/bin/env node
/**
 * List connectivity probe records for a date (validation / ops).
 * Usage: node ingest-connectivity-probes.js --date YYYY-MM-DD [--scope national|north]
 * @see business_modules/resilience_scorer/app/assessment/ingestConnectivityProbesCli.js
 */
import 'dotenv/config';
import { runIngestConnectivityProbesCli } from '../app/assessment/ingestConnectivityProbesCli.js';

try {
  await runIngestConnectivityProbesCli(process.argv.slice(2));
} catch (err) {
  console.error('ingest-connectivity-probes failed:', err?.message ?? err);
  process.exit(1);
}
