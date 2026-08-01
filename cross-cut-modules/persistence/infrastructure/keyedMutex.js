/**
 * Per-key async mutex: calls for the same key run one at a time (promise
 * chain), different keys run independently. In-process only — sufficient for
 * the single-writer topology (ADR 004).
 */
export function createKeyedMutex() {
  /** @type {Map<string, Promise<unknown>>} */
  const tails = new Map();

  return {
    /**
     * @template T
     * @param {string} key
     * @param {() => Promise<T> | T} fn
     * @returns {Promise<T>}
     */
    async runExclusive(key, fn) {
      const prev = tails.get(key) ?? Promise.resolve();
      const run = prev.then(() => fn(), () => fn());
      // Track completion (success or failure) so the chain never wedges.
      const tail = run.then(() => undefined, () => undefined).finally(() => {
        if (tails.get(key) === tail) tails.delete(key);
      });
      tails.set(key, tail);
      return run;
    },
  };
}
