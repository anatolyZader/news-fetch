/**
 * Canonical filesystem paths for specialist-agent runtime artifacts.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

export function resolveRepoRoot(rootDir) {
  return rootDir ?? REPO_ROOT;
}

export function assessmentTracesDir(rootDir) {
  return resolve(resolveRepoRoot(rootDir), 'business_modules/specialist_agents/data/traces');
}

export function assessmentEvalDir(rootDir) {
  return resolve(resolveRepoRoot(rootDir), 'business_modules/specialist_agents/data/eval');
}

// Single source of truth lives in resilience_scorer/index.js;
// re-exported here so callers within this module don't need a cross-module import.
export { resilienceReportsDir, resilienceCapturesDir } from '../../../resilience_scorer/index.js';
