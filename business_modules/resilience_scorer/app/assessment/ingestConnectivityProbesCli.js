import { loadConnectivityProbeSignals } from '../../infrastructure/adapters/connectivityProbeFileAdapter.js';

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

/**
 * @param {string[]} [argv]
 */
export function runIngestConnectivityProbesCli(argv = process.argv.slice(2)) {
  const { date, scope } = parseArgs(argv);
  const signals = loadConnectivityProbeSignals(date, scope);
  console.log(JSON.stringify({ date, scope, count: signals.length, signals }, null, 2));
}
