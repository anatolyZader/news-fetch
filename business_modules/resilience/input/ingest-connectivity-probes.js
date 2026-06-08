#!/usr/bin/env node
/**
 * List connectivity probe records for a date (validation / ops).
 * Usage: node ingest-connectivity-probes.js --date YYYY-MM-DD [--scope national|north]
 */
import 'dotenv/config';
import { runIngestConnectivityProbesCli } from '../app/ingestConnectivityProbesCli.js';

runIngestConnectivityProbesCli(process.argv.slice(2));
