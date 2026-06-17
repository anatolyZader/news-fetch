/**
 * Copy an existing bundle to a sibling `archive/` directory before overwrite.
 * Preserves prior extraction outputs for comparison; never deletes the canonical path.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

function archiveTimestamp() {
  return new Date().toISOString().replaceAll(/[:.]/g, '-').slice(0, 19);
}

/**
 * @param {string} targetPath Absolute path to the bundle about to be overwritten
 * @param {{ archiveSubdir?: string }} [opts]
 * @returns {string|null} path of the archived copy, or null when nothing to archive
 */
export function archiveArtifactBeforeWrite(targetPath, { archiveSubdir = 'archive' } = {}) {
  if (!targetPath || !existsSync(targetPath)) return null;
  const dir = dirname(targetPath);
  const archiveDir = join(dir, archiveSubdir);
  mkdirSync(archiveDir, { recursive: true });
  const stem = basename(targetPath, '.json');
  const archivedPath = join(archiveDir, `${stem}-${archiveTimestamp()}.json`);
  copyFileSync(targetPath, archivedPath);
  return archivedPath;
}

export default archiveArtifactBeforeWrite;
