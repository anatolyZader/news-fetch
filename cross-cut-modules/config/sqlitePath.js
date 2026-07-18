/**
 * Canonical SQLITE_PATH resolution: env override (resolved) or <repoRoot>/db/app.sqlite.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [rootDir] repo root override; defaults to this repo's root
 * @returns {string} absolute sqlite path
 */
export function resolveSqlitePath(env = process.env, rootDir) {
  const v = env.SQLITE_PATH?.trim();
  return v ? resolve(v) : resolve(rootDir ?? REPO_ROOT, 'db', 'app.sqlite');
}
