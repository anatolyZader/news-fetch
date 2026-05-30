import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Current git branch for SonarCloud branch-scoped issue queue (IDE Connected Mode).
 * @param {string} [override] explicit --branch value
 * @returns {string|undefined}
 */
export function resolveSonarBranch(override = '') {
  const trimmed = String(override ?? '').trim();
  if (trimmed) return trimmed;
  try {
    const branch = execSync('git branch --show-current', {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
    return branch || undefined;
  } catch {
    return undefined;
  }
}
