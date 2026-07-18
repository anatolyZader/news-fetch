/**
 * Canonical filesystem paths for analyst-side assessment artifacts.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

export function resolveRepoRoot(rootDir) {
  return rootDir ?? REPO_ROOT;
}

/**
 * Consumed directly by business_modules/specialist_agents/infrastructure/adapters/shadowArtifactsFileAdapter.js
 * (specialist-agent eval tooling, unrelated to the removed resilience_scorer analyst/shadow subsystem).
 */
export function analystShadowDir(rootDir) {
  return resolve(resolveRepoRoot(rootDir), 'business_modules/resilience_scorer/analyst/data/shadow');
}
