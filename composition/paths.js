import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const compositionDir = dirname(fileURLToPath(import.meta.url));

/** Repository root (parent of composition/). */
export const repoRoot = resolve(compositionDir, '..');

export function resolveFromRepo(...segments) {
  return resolve(repoRoot, ...segments);
}
