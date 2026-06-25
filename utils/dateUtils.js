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

const DEFAULT_ANALYSIS_TZ = process.env.TZ_ARTICLES || 'Asia/Jerusalem';

/**
 * Format an analysis timestamp for operator display (date + time in project timezone).
 * @param {string|null|undefined} isoOrDate - ISO-8601 datetime or YYYY-MM-DD
 * @param {{ timezone?: string }} [opts]
 * @returns {string|null} e.g. "2026-03-21 14:32" or date-only if no time available
 */
export function formatAnalysisDateTime(isoOrDate, opts = {}) {
  const raw = String(isoOrDate ?? '').trim();
  if (!raw) return null;
  const tz = opts.timezone ?? DEFAULT_ANALYSIS_TZ;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10) || null;
  const datePart = d.toLocaleDateString('en-CA', { timeZone: tz });
  const timePart = d.toLocaleTimeString('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${datePart} ${timePart}`;
}
