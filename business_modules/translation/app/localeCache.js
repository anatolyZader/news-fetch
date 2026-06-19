import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPORTS_DIR = resolve(__dirname, '../../../daily_reports');

const memCache = new Map();

/** @type {string | null} */
let cacheDirOverride = null;

function cacheDir() {
  return cacheDirOverride ?? DEFAULT_REPORTS_DIR;
}

/** @param {string | null} dir */
export function setLocaleCacheDirForTests(dir) {
  cacheDirOverride = dir;
}

export function resetLocaleCacheForTests() {
  memCache.clear();
  cacheDirOverride = null;
}

/**
 * @param {string} resourceId
 * @param {unknown} payload
 * @param {string} [extra]
 */
export function fingerprintPayload(resourceId, payload, extra = '') {
  const hash = createHash('sha256')
    .update(resourceId)
    .update(extra)
    .update(JSON.stringify(payload ?? {}))
    .digest('hex')
    .slice(0, 20);
  return hash;
}

function cacheFilePath(resourceId, fingerprint, lang) {
  const safeResource = resourceId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return resolve(cacheDir(), `locale-v1-${safeResource}-${fingerprint}-${lang}.json`);
}

/**
 * @param {string} resourceId
 * @param {string} fingerprint
 * @param {string} lang
 */
export async function readLocaleCache(resourceId, fingerprint, lang) {
  const key = `${resourceId}:${fingerprint}:${lang}`;
  if (memCache.has(key)) return memCache.get(key);
  try {
    const raw = await readFile(cacheFilePath(resourceId, fingerprint, lang), 'utf8');
    const parsed = JSON.parse(raw);
    memCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @param {string} resourceId
 * @param {string} fingerprint
 * @param {string} lang
 * @param {unknown} payload
 */
export async function writeLocaleCache(resourceId, fingerprint, lang, payload) {
  const key = `${resourceId}:${fingerprint}:${lang}`;
  try {
    await writeFile(cacheFilePath(resourceId, fingerprint, lang), JSON.stringify(payload), 'utf8');
    memCache.set(key, payload);
  } catch {
    /* non-fatal */
  }
}
