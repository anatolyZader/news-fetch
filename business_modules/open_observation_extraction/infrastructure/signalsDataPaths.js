/**
 * Default filesystem paths for open_observation_extraction module data.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Module data root (open observation bundles).
 * @param {{ dataDir?: string }} [opts]
 */
export function defaultOpenObservationDataDir(opts = {}) {
  return opts.dataDir ?? resolve(MODULE_ROOT, 'data');
}
