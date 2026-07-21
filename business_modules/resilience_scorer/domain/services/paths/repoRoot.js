/**
 * Shared repo-root resolver for resilience_scorer path helpers.
 *
 * Pipeline position: foundational — every `paths/*` helper resolves artifacts
 * relative to this root before assess/extract CLIs or infrastructure adapters touch disk.
 *
 * Owns: default `REPO_ROOT` anchor and optional override via `resolveRepoRoot`.
 * Does NOT: construct channel-specific paths (see sibling `ingestPaths.js`,
 * `outputDirs.js`) or read/write files.
 *
 * Key collaborators: `paths/ingestPaths.js`, `paths/outputDirs.js`,
 * `paths/signalBundles.js`, infrastructure bundle adapters.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Repo root anchor
// ---------------------------------------------------------------------------

/** Default monorepo root derived from this module's location. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

/**
 * Resolve repo root, preferring an explicit override when provided.
 * @param {string | undefined} rootDir
 * @returns {string}
 */
export function resolveRepoRoot(rootDir) {
  return rootDir ?? REPO_ROOT;
}
