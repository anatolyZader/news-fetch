import { randomBytes } from 'node:crypto';
import { renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { rename, unlink, writeFile } from 'node:fs/promises';

/**
 * Write-temp-then-rename so concurrent readers never observe a torn file.
 * The temp file lives in the same directory as the target (rename is only
 * atomic within a filesystem).
 */

function tempPathFor(filePath) {
  return `${filePath}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
}

/**
 * @param {string} filePath
 * @param {string | Buffer} data
 * @param {{ encoding?: BufferEncoding }} [opts]
 */
export function writeFileAtomicSync(filePath, data, opts = {}) {
  const tmpPath = tempPathFor(filePath);
  try {
    writeFileSync(tmpPath, data, { encoding: opts.encoding ?? 'utf8' });
    renameSync(tmpPath, filePath);
  } catch (err) {
    try { unlinkSync(tmpPath); } catch { /* temp already gone */ }
    throw err;
  }
}

/**
 * @param {string} filePath
 * @param {string | Buffer} data
 * @param {{ encoding?: BufferEncoding }} [opts]
 */
export async function writeFileAtomic(filePath, data, opts = {}) {
  const tmpPath = tempPathFor(filePath);
  try {
    await writeFile(tmpPath, data, { encoding: opts.encoding ?? 'utf8' });
    await rename(tmpPath, filePath);
  } catch (err) {
    try { await unlink(tmpPath); } catch { /* temp already gone */ }
    throw err;
  }
}
