/**
 * Bounded retry for LLM calls with 429-aware backoff: 90s on rate limit,
 * otherwise 5s × attempt.
 */

export function llmRetryWaitMs(err, attempt) {
  const is429 = err.message?.includes('429') || err.status === 429;
  return is429 ? 90000 : 5000 * attempt;
}

/**
 * Provider/network failures a retry can plausibly fix (mirrors the circuit
 * breaker's classification in llmGateway). Deterministic errors (400s other
 * than 429, schema violations, aborts) return false.
 */
export function isTransientLlmError(err) {
  if (!err || typeof err !== 'object') return false;
  if (err.name === 'AbortError') return false;
  const status = err.status ?? err.statusCode ?? err?.response?.status;
  if (status === 429) return true;
  if (Number.isFinite(status) && status >= 500 && status <= 599) return true;
  const code = err.code ?? err?.cause?.code ?? '';
  if (['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND'].includes(code)) return true;
  const msg = String(err.message ?? '');
  return /rate.?limit|429|overloaded|timeout|timed out|unavailable|temporarily/i.test(msg);
}

/**
 * @template T
 * @param {(attempt: number) => Promise<T>} fn 1-based attempt index
 * @param {object} [opts]
 * @param {number} [opts.retries] total attempts (not extra retries)
 * @param {(err: Error, attempt: number) => number} [opts.waitMs]
 * @param {(err: Error, attempt: number, waitMs: number) => void} [opts.onRetry]
 * @param {(err: Error) => boolean} [opts.shouldRetry] return false to rethrow immediately
 *   (e.g. deterministic errors like token overflow that a retry cannot fix)
 * @returns {Promise<T>} last attempt's error is rethrown
 */
export async function withLlmRetry(fn, { retries = 3, waitMs = llmRetryWaitMs, onRetry, shouldRetry } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (shouldRetry && !shouldRetry(err)) throw err;
      if (attempt === retries) break;
      const wait = waitMs(err, attempt);
      onRetry?.(err, attempt, wait);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}
