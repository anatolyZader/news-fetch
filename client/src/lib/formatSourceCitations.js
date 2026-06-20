/**
 * Convert markdown [label](url) citations into readable academic-style parentheticals.
 */

const GENERIC_SOURCE = /^source$/i;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * @param {string|undefined|null} reportDate ISO YYYY-MM-DD
 * @returns {string}
 */
export function formatReportDateLabel(reportDate) {
  if (!reportDate || typeof reportDate !== 'string') return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(reportDate.trim());
  if (!m) return '';
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${String(day).padStart(2, '0')} ${MONTHS[month - 1]} ${year}`;
}

/**
 * @param {string} url
 * @returns {string}
 */
export function labelFromUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, '');
    if (host) return host;
    const segment = parsed.pathname.split('/').filter(Boolean).at(-1);
    if (segment) return decodeURIComponent(segment).slice(0, 48);
  } catch {
    // fall through
  }
  const trimmed = String(url ?? '').trim();
  return trimmed.length > 48 ? `${trimmed.slice(0, 45)}…` : trimmed;
}

const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:[^)\s]+)\)/gi;

/**
 * @param {string} markdown
 * @param {string|undefined|null} [reportDate]
 * @returns {string}
 */
export function formatReadableCitations(markdown, reportDate) {
  if (typeof markdown !== 'string') return '';
  if (!markdown) return markdown;
  return markdown.replace(MARKDOWN_LINK, (match, text, url) => {
    const label = GENERIC_SOURCE.test(String(text).trim()) ? labelFromUrl(url) : String(text).trim();
    const datePart = formatReportDateLabel(reportDate);
    if (!label) return match;
    return datePart ? `(${label}, ${datePart})` : `(${label})`;
  });
}

/**
 * Expand generic [source](url) then apply readable parentheticals.
 * @param {string} markdown
 * @param {string|undefined|null} [reportDate]
 * @param {(md: string) => string} [expandLinks]
 * @returns {string}
 */
export function formatReportMarkdown(markdown, reportDate, expandLinks = (md) => md) {
  if (typeof markdown !== 'string') return '';
  const expanded = expandLinks(markdown);
  return formatReadableCitations(expanded, reportDate);
}
