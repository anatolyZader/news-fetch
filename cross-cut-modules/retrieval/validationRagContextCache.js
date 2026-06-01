/**
 * In-memory cache for validation review RAG context (per queue item).
 */

const globalCache = new Map();

function cacheTtlMs() {
  const n = Number.parseInt(process.env.VALIDATION_RAG_CACHE_TTL_MS ?? '900000', 10);
  return Number.isFinite(n) && n > 0 ? n : 900_000;
}

/**
 * @param {string} date
 * @param {string} scope
 * @param {string} articleKey
 */
export function validationRagCacheKey(date, scope, articleKey) {
  return `${date}|${scope}|${articleKey}`;
}

function prune() {
  const now = Date.now();
  for (const [k, v] of globalCache) {
    if (v.expiresAt <= now) globalCache.delete(k);
  }
}

/**
 * @param {string} key
 * @returns {object|null}
 */
export function getValidationRagCache(key) {
  prune();
  const entry = globalCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) globalCache.delete(key);
    return null;
  }
  return entry.value;
}

/**
 * @param {string} key
 * @param {object} value — { rag, article }
 */
export function setValidationRagCache(key, value) {
  prune();
  globalCache.set(key, {
    expiresAt: Date.now() + cacheTtlMs(),
    value,
  });
}

/** Clear cache (tests). */
export function clearValidationRagCache() {
  globalCache.clear();
}
