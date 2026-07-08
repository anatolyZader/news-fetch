/**
 * Shared repo-root resolver for resilience_scorer path helpers.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

/**
 * @param {string | undefined} rootDir
 * @returns {string}
 */
export function resolveRepoRoot(rootDir) {
  return rootDir ?? REPO_ROOT;
}
