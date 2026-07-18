/**
 * Bounded retry for LLM calls with 429-aware backoff: 90s on rate limit,
 * otherwise 5s × attempt.
 */

export function llmRetryWaitMs(err, attempt) {
  const is429 = err.message?.includes('429') || err.status === 429;
  return is429 ? 90000 : 5000 * attempt;
}

/**
 * @template T
 * @param {(attempt: number) => Promise<T>} fn 1-based attempt index
 * @param {object} [opts]
 * @param {number} [opts.retries] total attempts (not extra retries)
 * @param {(err: Error, attempt: number) => number} [opts.waitMs]
 * @param {(err: Error, attempt: number, waitMs: number) => void} [opts.onRetry]
 * @returns {Promise<T>} last attempt's error is rethrown
 */
export async function withLlmRetry(fn, { retries = 3, waitMs = llmRetryWaitMs, onRetry } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      const wait = waitMs(err, attempt);
      onRetry?.(err, attempt, wait);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}
