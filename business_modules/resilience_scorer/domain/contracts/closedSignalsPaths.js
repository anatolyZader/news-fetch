/**
 * Canonical filesystem path for closed-signal bundle artifacts.
 *
 * Pipeline position: extract/assess CLI and adapters — resolves
 * signals-{source}-{date}.json directory. Node-only (path imports).
 *
 * Owns: closedSignalsDir absolute path resolver with optional override.
 * Does NOT: bundle read/write logic or open-observation paths.
 *
 * Key collaborators: ISignalBundlePort adapters, extract-signals.js,
 * assess-signals.js, path helpers under domain/services/paths/.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/**
 * Absolute path to the closed-signal bundles directory.
 * @param {{ signalsDir?: string }} [opts]
 * @returns {string}
 */
export function closedSignalsDir(opts = {}) {
  return opts.signalsDir ?? resolve(REPO_ROOT, 'business_modules/resilience_scorer/data/signals');
}
