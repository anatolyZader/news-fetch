import { loadConnectivityProbeSignals } from '../../infrastructure/adapters/connectivityProbeFileAdapter.js';
import { getArg } from '../cliArgs.js';

function parseArgs(argv) {
  return {
    date: getArg(argv, '--date') ?? new Date().toISOString().slice(0, 10),
    scope: getArg(argv, '--scope') ?? 'national',
  };
}

/**
 * @param {string[]} [argv]
 */
export function runIngestConnectivityProbesCli(argv = process.argv.slice(2)) {
  const { date, scope } = parseArgs(argv);
  const signals = loadConnectivityProbeSignals(date, scope);
  console.log(JSON.stringify({ date, scope, count: signals.length, signals }, null, 2));
}
