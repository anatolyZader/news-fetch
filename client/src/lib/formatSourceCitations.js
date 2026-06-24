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
const SIGNAL_REF = /\[S\d+\]/g;
const SPACED_SIGNAL_GROUP = /\(\s*(\[S\d+\](?:\s*,\s*\[S\d+\])*)\s*\)/g;

/**
 * Group consecutive [S#] refs into academic-style parentheticals: ([S1],[S2]).
 * @param {string} markdown
 * @returns {string}
 */
export function formatAcademicSignalRefs(markdown) {
  if (typeof markdown !== 'string') return '';
  if (!markdown) return markdown;

  const step1 = markdown.replaceAll(SPACED_SIGNAL_GROUP, (_, inner) => {
    const refs = [...inner.matchAll(SIGNAL_REF)].map((m) => m[0]);
    return refs.length > 0 ? `(${refs.join(',')})` : `(${inner})`;
  });

  return step1.replaceAll(/(?:\[S\d+\])+(?=[.!?;\s]|$)/g, (run) => {
    const refs = [...run.matchAll(SIGNAL_REF)].map((m) => m[0]);
    return refs.length > 0 ? `(${refs.join(',')})` : run;
  });
}

/**
 * Academic parentheticals with a subtle clickable label: ([Ynet](url), DD Mon YYYY).
 * @param {string} markdown
 * @param {string|undefined|null} [reportDate]
 * @returns {string}
 */
export function formatLinkedReadableCitations(markdown, reportDate) {
  if (typeof markdown !== 'string') return '';
  if (!markdown) return markdown;
  const datePart = formatReportDateLabel(reportDate);
  return markdown.replaceAll(MARKDOWN_LINK, (match, text, url) => {
    const label = GENERIC_SOURCE.test(String(text).trim()) ? labelFromUrl(url) : String(text).trim();
    if (!label) return match;
    if (!datePart) return `([${label}](${url}))`;
    return `([${label}](${url}), ${datePart})`;
  });
}

/**
 * Operator narrative prose: signal-ref grouping + linked academic citations.
 * @param {string} markdown
 * @param {string|undefined|null} [reportDate]
 * @param {(md: string) => string} [expandLinks]
 * @returns {string}
 */
export function formatNarrativeMarkdown(markdown, reportDate, expandLinks = (md) => md) {
  if (typeof markdown !== 'string') return '';
  const expanded = expandLinks(markdown);
  const withSignals = formatAcademicSignalRefs(expanded);
  return formatLinkedReadableCitations(withSignals, reportDate);
}

/**
 * @param {string} markdown
 * @param {string|undefined|null} [reportDate]
 * @returns {string}
 */
export function formatReadableCitations(markdown, reportDate) {
  if (typeof markdown !== 'string') return '';
  if (!markdown) return markdown;
  return markdown.replaceAll(MARKDOWN_LINK, (match, text, url) => {
    const label = GENERIC_SOURCE.test(String(text).trim()) ? labelFromUrl(url) : String(text).trim();
    const datePart = formatReportDateLabel(reportDate);
    if (!label) return match;
    return datePart ? `(${label}, ${datePart})` : `(${label})`;
  });
}

/**
 * Evidence bullets: [source](url) → ([label](url), DD Mon YYYY).
 * @param {string} markdown
 * @param {string|undefined|null} [reportDate]
 * @returns {string}
 */
export function formatEvidenceCitations(markdown, reportDate) {
  return formatLinkedReadableCitations(markdown, reportDate);
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

/**
 * Evidence list markdown: expand [source](url) then linked academic citations.
 * @param {string} markdown
 * @param {string|undefined|null} [reportDate]
 * @param {(md: string) => string} [expandLinks]
 * @returns {string}
 */
export function formatEvidenceMarkdown(markdown, reportDate, expandLinks = (md) => md) {
  if (typeof markdown !== 'string') return '';
  const expanded = expandLinks(markdown);
  return formatEvidenceCitations(expanded, reportDate);
}
