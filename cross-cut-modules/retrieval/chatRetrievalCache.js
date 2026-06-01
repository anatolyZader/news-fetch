/**
 * Per-session retrieval cache — avoids duplicate hybrid search for hint + search_sources.
 */

function cacheTtlMs() {
  const n = Number.parseInt(process.env.CHAT_RETRIEVAL_CACHE_TTL_MS ?? '600000', 10);
  return Number.isFinite(n) && n > 0 ? n : 600_000;
}

function normalizeQuery(q) {
  return String(q ?? '').trim().toLowerCase().replaceAll(/\s+/g, ' ');
}

/**
 * @param {string} sessionId
 * @param {string} query
 * @param {string} reportGeoScope
 * @param {string} [dateWindowKey]
 */
export function chatRetrievalCacheKey(sessionId, query, reportGeoScope, dateWindowKey = '') {
  return `${sessionId}|${normalizeQuery(query)}|${reportGeoScope}|${dateWindowKey}`;
}

/**
 * @param {string} [sessionId]
 */
export function createChatRetrievalCache(sessionId = '') {
  const sid = String(sessionId ?? '').trim();
  const store = new Map();

  function prune() {
    const now = Date.now();
    for (const [k, v] of store) {
      if (v.expiresAt <= now) store.delete(k);
    }
  }

  return {
    sessionId: sid,

    /**
     * @param {string} key
     */
    get(key) {
      prune();
      const entry = store.get(key);
      if (!entry || entry.expiresAt <= Date.now()) {
        if (entry) store.delete(key);
        return null;
      }
      return entry.value;
    },

    /**
     * @param {string} key
     * @param {{ rewrittenQuery?: string, hits?: Array<object>, hintText?: string, searchHits?: Array<object> }} value
     */
    set(key, value) {
      prune();
      store.set(key, {
        expiresAt: Date.now() + cacheTtlMs(),
        value,
      });
    },
  };
}
