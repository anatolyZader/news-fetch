/** Allowed dashboard time windows (days). */
export const TREND_WINDOW_DAYS = Object.freeze([1, 3, 7]);

const ALLOWED = new Set(TREND_WINDOW_DAYS);

/**
 * @param {unknown} raw
 * @param {number} [fallback=7]
 * @returns {1 | 3 | 7}
 */
export function normalizeTrendWindowDays(raw, fallback = 7) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  if (ALLOWED.has(n)) return /** @type {1 | 3 | 7} */ (n);
  const fb = ALLOWED.has(fallback) ? fallback : 7;
  return /** @type {1 | 3 | 7} */ (fb);
}
