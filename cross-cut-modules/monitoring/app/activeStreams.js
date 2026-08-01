/**
 * Registry of in-flight SSE streams (chat turns). Feeds the
 * chat.active_sse_streams gauge and lets graceful shutdown abort what is
 * still open after the drain window.
 */

/** @type {Set<AbortController>} */
const active = new Set();

/**
 * @param {AbortController} abortController
 * @returns {() => void} unregister
 */
export function registerActiveStream(abortController) {
  active.add(abortController);
  return () => active.delete(abortController);
}

export function getActiveStreamCount() {
  return active.size;
}

/** @param {string} reason */
export function abortAllActiveStreams(reason) {
  for (const controller of active) {
    if (!controller.signal.aborted) {
      controller.abort(new Error(reason));
    }
  }
}
