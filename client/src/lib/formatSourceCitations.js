/**
 * Convert markdown [label](url) citations into APA parentheticals: (Author, DD Mon YYYY).
 */
import {
  apaAuthorFromUrl,
  apaAuthorLabel,
  formatApaCitationDate,
  formatApaCitationsInMarkdown,
} from '../../../cross-cut-modules/resilience-contracts/apaCitationFormat.js';

const GENERIC_SOURCE = /^source$/i;
const SIGNAL_REF = /\[S\d+\]/g;
const SPACED_SIGNAL_GROUP = /\(\s*(\[S\d+\](?:\s*,\s*\[S\d+\])*)\s*\)/g;

/** @deprecated use formatApaCitationDate */
export function formatReportDateLabel(reportDate) {
  return formatApaCitationDate(reportDate);
}

/**
 * @param {string} url
 * @returns {string}
 */
export function labelFromUrl(url) {
  return apaAuthorFromUrl(url);
}

/**
 * Group consecutive [S#] refs into parentheticals (resolved server-side when possible).
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
 * APA parentheticals with clickable author: ([Ynet](url), 12 Apr 2026).
 * @param {string} markdown
 * @param {string|undefined|null} [reportDate]
 * @returns {string}
 */
export function formatLinkedReadableCitations(markdown, reportDate) {
  return formatApaCitationsInMarkdown(markdown, reportDate, { linked: true });
}

/**
 * Operator narrative prose: signal-ref grouping + APA linked citations.
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
 * Plain APA parentheticals without hyperlinks: (Ynet, 12 Apr 2026).
 * @param {string} markdown
 * @param {string|undefined|null} [reportDate]
 * @returns {string}
 */
export function formatReadableCitations(markdown, reportDate) {
  return formatApaCitationsInMarkdown(markdown, reportDate, { linked: false });
}

/**
 * Evidence bullets: APA with linked author for drill-down.
 * @param {string} markdown
 * @param {string|undefined|null} [reportDate]
 * @returns {string}
 */
export function formatEvidenceCitations(markdown, reportDate) {
  return formatLinkedReadableCitations(markdown, reportDate);
}

/**
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

// Re-export for tests that assert author resolution
export { apaAuthorLabel, GENERIC_SOURCE };
