/**
 * Pure href safety checks for markdown renderers (no JSX — safe for Node tests).
 */

const BLOCKED_SCHEME_RE = /^(javascript|data|vbscript):/i;

/**
 * @param {string | undefined} href
 * @returns {boolean}
 */
export function isSafeMarkdownHref(href) {
  const raw = String(href ?? '').trim();
  if (!raw) return false;
  if (BLOCKED_SCHEME_RE.test(raw)) return false;
  if (raw.startsWith('//')) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return /^(https?|mailto):/i.test(raw);
  }
  return true;
}
