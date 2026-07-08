/**
 * Canonical path for the closed-signal bundles written by resilience_scorer.
 * Shared by all modules that read or write signals-{source}-{date}.json.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Absolute path to the closed-signal bundles directory.
 * @param {{ signalsDir?: string }} [opts]
 * @returns {string}
 */
export function closedSignalsDir(opts = {}) {
  return opts.signalsDir ?? resolve(REPO_ROOT, 'business_modules/resilience_scorer/data/signals');
}
