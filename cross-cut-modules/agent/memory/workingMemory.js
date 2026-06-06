/**
 * In-run working memory keyed by agent runId.
 */

/** @type {Map<string, Map<string, unknown>>} */
const runs = new Map();

/**
 * @param {string} runId
 */
export function createWorkingMemory(runId) {
  const store = new Map();
  runs.set(runId, store);

  return {
    runId,
    set(key, value) {
      store.set(String(key), value);
    },
    get(key) {
      return store.get(String(key));
    },
    has(key) {
      return store.has(String(key));
    },
    delete(key) {
      store.delete(String(key));
    },
    entries() {
      return [...store.entries()];
    },
    snapshot() {
      const out = {};
      for (const [k, v] of store) out[k] = v;
      return out;
    },
    dispose() {
      runs.delete(runId);
    },
  };
}

/**
 * @param {string} runId
 */
export function getWorkingMemory(runId) {
  const store = runs.get(runId);
  if (!store) return null;
  return {
    get: (key) => store.get(String(key)),
    set: (key, val) => store.set(String(key), val),
  };
}
