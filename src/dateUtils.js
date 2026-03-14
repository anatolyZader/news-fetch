/**
 * Get today's date as YYYY-MM-DD in the given timezone.
 * @param {string} timezone - IANA timezone (e.g. 'Asia/Jerusalem')
 * @returns {string}
 */
export function getTodayInTimezone(timezone) {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone || 'Asia/Jerusalem' });
}

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate date string YYYY-MM-DD: format, valid calendar date, not future (in timezone).
 * @param {string} dateStr
 * @param {string} timezone
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateDate(dateStr, timezone = 'Asia/Jerusalem') {
  if (!dateStr || typeof dateStr !== 'string') {
    return { valid: false, error: 'Invalid date' };
  }
  const trimmed = dateStr.trim();
  if (!YYYY_MM_DD.test(trimmed)) {
    return { valid: false, error: 'Invalid date format; use YYYY-MM-DD' };
  }
  const [y, m, d] = trimmed.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return { valid: false, error: 'Invalid date' };
  }
  const today = getTodayInTimezone(timezone);
  if (trimmed > today) {
    return { valid: false, error: 'Future date not allowed' };
  }
  return { valid: true };
}
