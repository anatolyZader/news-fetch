#!/usr/bin/env node
/**
 * List connectivity probe records for a date (validation / ops).
 * Usage: node ingest-connectivity-probes.js --date YYYY-MM-DD [--scope national|north]
 */

import 'dotenv/config';
import { loadConnectivityProbeSignals } from '../infrastructure/adapters/connectivityProbeFileAdapter.js';

function parseArgs(argv) {
  const getArg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : null;
  };
  return {
    date: getArg('--date') ?? new Date().toISOString().slice(0, 10),
    scope: getArg('--scope') ?? 'national',
  };
}

const { date, scope } = parseArgs(process.argv.slice(2));
const signals = loadConnectivityProbeSignals(date, scope);
console.log(JSON.stringify({ date, scope, count: signals.length, signals }, null, 2));
