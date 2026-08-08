/**
 * Recipient address normalization for the shared digest list.
 * Domain-level so the input and infrastructure layers can share one rule.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {unknown} email
 * @returns {string} normalized (trimmed, lowercased) address, or '' when invalid
 */
export function normalizeRecipientEmail(email) {
  const v = String(email ?? '').trim().toLowerCase();
  return EMAIL_RE.test(v) ? v : '';
}
