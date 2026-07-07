/**
 * Canonical filesystem paths for analyst-side assessment artifacts.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export function resolveRepoRoot(rootDir) {
  return rootDir ?? REPO_ROOT;
}

export function analystShadowDir(rootDir) {
  return resolve(resolveRepoRoot(rootDir), 'analyst/data/shadow');
}

export function analystReviewsDir(rootDir) {
  return resolve(resolveRepoRoot(rootDir), 'analyst/data/reviews');
}
