/**
 * Canonical filesystem paths for translation locale cache artifacts.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

export function resolveRepoRoot(rootDir) {
  return rootDir ?? REPO_ROOT;
}

export function translationLocaleDir(rootDir) {
  return resolve(resolveRepoRoot(rootDir), 'business_modules/translation/data/locale');
}
