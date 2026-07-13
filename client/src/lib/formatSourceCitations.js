/**
 * Convert markdown [label](url) citations into APA parentheticals: (Author, DD Mon YYYY).
 */
import {
  apaAuthorFromUrl,
  formatApaCitationDate,
  formatApaCitationsInMarkdown,
} from '../../../business_modules/resilience_scorer/domain/contracts/apaCitationFormat.js';
import {
  buildCitationRegistryFromStored,
} from '../../../business_modules/resilience_scorer/domain/contracts/citationDisplay.js';
import {
  linkPlainApaParentheticals,
  resolveInlineSignalCitations,
} from '../../../business_modules/resilience_scorer/domain/contracts/inlineCitationResolve.js';

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
 * @param {string} markdown
 * @param {string|undefined|null} reportDate
 * @param {Array<object>|null|undefined} [citationRegistryEntries]
 * @param {string|null|undefined} [componentId]
 * @returns {string}
 */
function resolveRegistryCitations(markdown, reportDate, citationRegistryEntries, componentId) {
  const registry = buildCitationRegistryFromStored(citationRegistryEntries);
  if (!registry) return markdown;
  let out = resolveInlineSignalCitations(markdown, registry, reportDate, {
    linked: true,
    linkMode: 'evidence',
    componentId,
    resolveMarkdown: true,
  });
  if (componentId) {
    out = linkPlainApaParentheticals(out, registry, reportDate, componentId);
  }
  return out;
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
 * Operator narrative prose: resolve internal refs + evidence-anchor APA citations.
 * @param {string} markdown
 * @param {string|undefined|null} [reportDate]
 * @param {(md: string) => string} [expandLinks]
 * @param {Array<object>|null|undefined} [citationRegistryEntries]
 * @param {{ componentId?: string|null }} [opts]
 * @returns {string}
 */
export function formatNarrativeMarkdown(
  markdown,
  reportDate,
  expandLinks = (md) => md,
  citationRegistryEntries = null,
  opts = {},
) {
  if (typeof markdown !== 'string') return '';
  const { componentId = null } = opts;
  const expanded = expandLinks(markdown);
  const resolved = resolveRegistryCitations(
    expanded,
    reportDate,
    citationRegistryEntries,
    componentId,
  );
  const withSignals = formatAcademicSignalRefs(resolved);
  if (/\]\(#evidence-/.test(withSignals)) {
    return withSignals;
  }
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
 * @param {Array<object>|null|undefined} [citationRegistryEntries]
 * @param {string|null|undefined} [componentId]
 * @returns {string}
 */
export function formatEvidenceCitations(
  markdown,
  reportDate,
  citationRegistryEntries = null,
  componentId = null,
) {
  const resolved = resolveRegistryCitations(
    markdown,
    reportDate,
    citationRegistryEntries,
    componentId,
  );
  return formatLinkedReadableCitations(resolved, reportDate);
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
 * @param {Array<object>|null|undefined} [citationRegistryEntries]
 * @param {{ componentId?: string|null }} [opts]
 * @returns {string}
 */
export function formatEvidenceMarkdown(
  markdown,
  reportDate,
  expandLinks = (md) => md,
  citationRegistryEntries = null,
  opts = {},
) {
  if (typeof markdown !== 'string') return '';
  const { componentId = null } = opts;
  const expanded = expandLinks(markdown);
  return formatEvidenceCitations(expanded, reportDate, citationRegistryEntries, componentId);
}

// Re-export for tests that assert author resolution
export { apaAuthorLabel } from '../../../business_modules/resilience_scorer/domain/contracts/apaCitationFormat.js';
export { GENERIC_SOURCE };
