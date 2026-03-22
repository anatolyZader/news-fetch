/**
 * Resolves media files placed under a single sandbox directory (e.g. copy-pasted into the repo).
 * Default: business_modules/video/input/files — override with VIDEO_LOCAL_INPUT_DIR.
 */
import { access, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, extname, isAbsolute, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOWED_EXT = new Set(['.mp3', '.mp4', '.webm', '.m4a', '.wav', '.ogg', '.mov', '.mkv']);

function defaultBaseDir() {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', 'input', 'files');
}

/**
 * @param {object} [deps]
 * @param {string} [deps.baseDir]  Absolute path to sandbox root
 */
export function createLocalVideoFileAdapter(deps = {}) {
  const baseDir = deps.baseDir ?? (process.env.VIDEO_LOCAL_INPUT_DIR?.trim()
    ? resolve(process.env.VIDEO_LOCAL_INPUT_DIR)
    : defaultBaseDir());

  /**
   * @param {string} relativePath  Path relative to baseDir (no leading ..)
   * @returns {Promise<{ ok: true, outputPath: string } | { ok: false, error: string }>}
   */
  async function resolveLocalPath(relativePath) {
    if (typeof relativePath !== 'string' || !relativePath.trim()) {
      return { ok: false, error: 'relativePath is required' };
    }

    const cleaned = normalize(relativePath.trim()).replace(/^(\.\.(\/|\\|$))+/, '');
    if (cleaned.startsWith('..')) {
      return { ok: false, error: 'path must not escape the sandbox' };
    }

    const abs = resolve(baseDir, cleaned);

    let realFile;
    let realBase;
    try {
      realFile = await realpath(abs);
      realBase = await realpath(baseDir);
    } catch {
      return { ok: false, error: 'file not found' };
    }

    const rel = relative(realBase, realFile);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      return { ok: false, error: 'path escapes allowed directory' };
    }

    const ext = extname(realFile).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return { ok: false, error: `extension not allowed (${[...ALLOWED_EXT].join(', ')})` };
    }

    try {
      await access(realFile, constants.R_OK);
    } catch {
      return { ok: false, error: 'file not readable' };
    }

    return { ok: true, outputPath: realFile };
  }

  return { resolveLocalPath, baseDir };
}
