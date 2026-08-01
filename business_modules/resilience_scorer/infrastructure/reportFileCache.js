/**
 * Mtime-keyed caches for report files. Reports are written atomically
 * (temp + rename, see reportWriter.js), so a changed file always changes
 * mtime/size and staleness is structurally impossible.
 *
 * REPORT_CACHE_ENABLED=false bypasses everything.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';

function cacheEnabled() {
  return process.env.REPORT_CACHE_ENABLED !== 'false';
}

function maxContentEntries() {
  const n = Number.parseInt(process.env.REPORT_CACHE_MAX_ENTRIES ?? '6', 10);
  return Number.isFinite(n) && n > 0 ? n : 6;
}

function dirTtlMs() {
  const n = Number.parseInt(process.env.REPORT_DIR_TTL_MS ?? '2000', 10);
  return Number.isFinite(n) && n >= 0 ? n : 2000;
}

const MAX_META_ENTRIES = 512;

/** @type {Map<string, { key: string, payload: object }>} parsed report payloads (multi-MB) */
const contentCache = new Map();
/** @type {Map<string, { key: string, meta: object }>} small derived metadata */
const metaCache = new Map();
/** @type {Map<string, { names: string[], dirMtimeMs: number, expiresAt: number }>} directory listings */
const dirCache = new Map();

function statKey(filePath) {
  const s = statSync(filePath);
  return `${s.mtimeMs}:${s.size}`;
}

function lruTouch(map, key, value, cap) {
  map.delete(key);
  map.set(key, value);
  while (map.size > cap) {
    map.delete(map.keys().next().value);
  }
}

/**
 * Parsed report JSON, cached by path + mtime + size. The returned object is
 * SHARED between requests — treat it as read-only (frozen outside production
 * to catch violations). Throws on read/parse failure like readFileSync would.
 *
 * @param {string} jsonPath
 * @returns {object}
 */
export function getParsedReportCached(jsonPath) {
  if (!cacheEnabled()) {
    return JSON.parse(readFileSync(jsonPath, 'utf-8'));
  }
  const key = statKey(jsonPath);
  const hit = contentCache.get(jsonPath);
  if (hit && hit.key === key) {
    lruTouch(contentCache, jsonPath, hit, maxContentEntries());
    return hit.payload;
  }
  const payload = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  if (process.env.NODE_ENV !== 'production') {
    Object.freeze(payload);
    if (payload && typeof payload === 'object' && payload.assessment) {
      Object.freeze(payload.assessment);
    }
  }
  lruTouch(contentCache, jsonPath, { key, payload }, maxContentEntries());
  return payload;
}

/**
 * Small derived metadata per report file, cached by path + mtime + size.
 * `derive(parsed)` runs only when the file changed. Throws on stat/read/parse
 * failure — callers keep their existing catch semantics.
 *
 * @param {string} jsonPath
 * @param {(parsed: object) => object} derive
 * @returns {object}
 */
export function getReportMetaCached(jsonPath, derive) {
  if (!cacheEnabled()) {
    return derive(JSON.parse(readFileSync(jsonPath, 'utf8')));
  }
  const key = statKey(jsonPath);
  const hit = metaCache.get(jsonPath);
  if (hit && hit.key === key) return hit.meta;

  // Reuse an already-parsed payload when it matches the same file version.
  const content = contentCache.get(jsonPath);
  const parsed = content && content.key === key
    ? content.payload
    : JSON.parse(readFileSync(jsonPath, 'utf8'));
  const meta = derive(parsed);
  lruTouch(metaCache, jsonPath, { key, meta }, MAX_META_ENTRIES);
  return meta;
}

/**
 * Directory listing keyed on the directory's own mtime (adding/removing an
 * entry bumps it, so new reports appear immediately) with a short TTL as a
 * backstop for coarse mtime granularity. Returns [] when unreadable.
 *
 * @param {string} dir
 * @returns {string[]}
 */
export function getDirNamesCached(dir) {
  if (!cacheEnabled()) {
    try { return readdirSync(dir); } catch { return []; }
  }
  let dirMtimeMs;
  try {
    dirMtimeMs = statSync(dir).mtimeMs;
  } catch {
    dirCache.delete(dir);
    return [];
  }
  const now = Date.now();
  const hit = dirCache.get(dir);
  if (hit && hit.dirMtimeMs === dirMtimeMs && hit.expiresAt > now) return hit.names;
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    names = [];
  }
  dirCache.set(dir, { names, dirMtimeMs, expiresAt: now + dirTtlMs() });
  return names;
}

export function resetReportFileCacheForTests() {
  contentCache.clear();
  metaCache.clear();
  dirCache.clear();
}
