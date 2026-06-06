/**
 * Default filesystem paths for signals_extraction module data.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Module data root (observations + closed signal bundles).
 * @param {{ dataDir?: string }} [opts]
 */
export function defaultSignalsExtractionDataDir(opts = {}) {
  return opts.dataDir ?? resolve(MODULE_ROOT, 'data');
}

/**
 * Closed-vocabulary signal bundles (`signals-{source}-{date}.json`).
 * @param {{ signalsDir?: string, dataDir?: string }} [opts]
 */
export function defaultClosedSignalsDir(opts = {}) {
  return opts.signalsDir ?? resolve(defaultSignalsExtractionDataDir(opts), 'signals');
}
