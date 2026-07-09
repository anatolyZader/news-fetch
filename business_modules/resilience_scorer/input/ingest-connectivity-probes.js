#!/usr/bin/env node
/**
 * List connectivity probe records for a date (validation / ops).
 * Usage: node ingest-connectivity-probes.js --date YYYY-MM-DD [--scope national|north]
 * @see business_modules/resilience_scorer/app/assessment/ingestConnectivityProbesCli.js
 */
import 'dotenv/config';
import { runIngestConnectivityProbesCli } from '../app/assessment/ingestConnectivityProbesCli.js';

runIngestConnectivityProbesCli(process.argv.slice(2));
