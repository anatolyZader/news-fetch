/**
 * APA-style in-text parenthetical citation formatting (Author, DD Mon YYYY).
 *
 * Pipeline position: report display (server + client) — formats and links citations
 * using the report assessment date. Client-safe isomorphic.
 *
 * Owns: date formatting, author labels, parenthetical assembly, markdown conversion.
 * Does NOT: signal registry lookup (citationDisplay.js) or evidence anchor ids.
 *
 * Key collaborators: citationDisplay.js, inlineCitationResolve.js, evidenceAnchor.js.
 */

const GENERIC_SOURCE = /^source$/i;
const URL_LIKE_TEXT = /^https?:\/\//i;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:[^)\s]+)\)/gi;
const CITATION_LINK_RUN = /(?:\[[^\]]+\]\(https?:[^)\s]+\)\s*)+/g;

/**
 * Format ISO YYYY-MM-DD report date as APA date label (DD Mon YYYY).
 * @param {string|undefined|null} reportDate ISO YYYY-MM-DD
 * @returns {string}
 */
export function formatApaCitationDate(reportDate) {
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
 * Derive a short author label from a URL hostname or path segment.
 * @param {string} url
 * @returns {string}
 */
export function apaAuthorFromUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, '');
    if (host) return host;
    const segment = parsed.pathname.split('/').findLast(Boolean);
    if (segment) return decodeURIComponent(segment).slice(0, 48);
  } catch {
    // fall through
  }
  const trimmed = String(url ?? '').trim();
  return trimmed.length > 48 ? `${trimmed.slice(0, 45)}…` : trimmed;
}

/**
 * Pick citation author from link text or fall back to URL-derived label.
 * @param {string} text
 * @param {string} url
 * @returns {string}
 */
export function apaAuthorLabel(text, url) {
  const trimmed = String(text ?? '').trim();
  if (trimmed && !GENERIC_SOURCE.test(trimmed) && !URL_LIKE_TEXT.test(trimmed)) {
    return trimmed;
  }
  return apaAuthorFromUrl(url);
}

/**
 * Format one APA citation part with optional link (external url or evidence anchor).
 * @param {string} author
 * @param {string} dateLabel DD Mon YYYY
 * @param {{ url?: string|null, linked?: boolean, linkMode?: 'none'|'external'|'evidence', evidenceHref?: string|null }} [opts]
 * @returns {string}
 */
export function formatApaCitationPart(author, dateLabel, opts = {}) {
  const {
    url = null,
    linked = false,
    linkMode = 'external',
    evidenceHref = null,
  } = opts;
  if (!author) return '';
  if (linked && linkMode === 'evidence' && evidenceHref) {
    return dateLabel ? `[${author}](${evidenceHref}), ${dateLabel}` : `[${author}](${evidenceHref})`;
  }
  if (linked && linkMode === 'external' && url) {
    return dateLabel ? `[${author}](${url}), ${dateLabel}` : `[${author}](${url})`;
  }
  return dateLabel ? `${author}, ${dateLabel}` : author;
}

/**
 * Join multiple APA citation parts into one parenthetical (Author, Date; Author2, Date).
 * @param {Array<{ author: string, url?: string|null, evidenceHref?: string|null }>} sources
 * @param {string} dateLabel
 * @param {{ linked?: boolean, linkMode?: 'none'|'external'|'evidence' }} [opts]
 * @returns {string}
 */
export function formatApaParenthetical(sources, dateLabel, opts = {}) {
  const { linked = false, linkMode = 'external' } = opts;
  const parts = sources
    .map(({ author, url, evidenceHref }) => formatApaCitationPart(author, dateLabel, {
      url,
      linked,
      linkMode,
      evidenceHref,
    }))
    .filter(Boolean);
  if (parts.length === 0) return '';
  return `(${parts.join('; ')})`;
}

/**
 * Replace markdown [label](url) citation runs with APA parentheticals.
 * @param {string} markdown
 * @param {string|undefined|null} reportDate
 * @param {{ linked?: boolean }} [opts]
 * @returns {string}
 */
export function formatApaCitationsInMarkdown(markdown, reportDate, opts = {}) {
  if (typeof markdown !== 'string' || !markdown) return '';
  const dateLabel = formatApaCitationDate(reportDate);
  const { linked = false } = opts;

  return markdown.replaceAll(CITATION_LINK_RUN, (run) => {
    const links = [...run.matchAll(MARKDOWN_LINK)];
    if (links.length === 0) return run;
    const sources = links.map(([, text, url]) => ({
      author: apaAuthorLabel(text, url),
      url,
    }));
    const apa = formatApaParenthetical(sources, dateLabel, { linked });
    if (!apa) return run;
    const hadTrailingSpace = /\s$/.test(run);
    return hadTrailingSpace ? `${apa} ` : apa;
  });
}
