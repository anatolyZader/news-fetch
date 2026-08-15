/**
 * User-facing citation labels and citation registry helpers (server + client).
 *
 * Pipeline position: report display — resolves signal metadata to APA authors
 * and builds lookup registries for inline citation replacement. Client-safe
 * isomorphic (React imports this layer deliberately).
 *
 * Owns: sourceTypeCitationLabel, citationAuthorForSignal, registry builders.
 * Does NOT: full APA parenthetical assembly (apaCitationFormat.js) or
 * narrativeGrounding QA.
 *
 * Key collaborators: apaCitationFormat.js, inlineCitationResolve.js,
 * signalCatalog.js (labels), client report citation components.
 */
import { apaAuthorFromUrl } from './apaCitationFormat.js';

/** Bracketed internal signal refs: [type@idx:N], [type@url:…], [type@file:…] */
export const INTERNAL_REF_BRACKET = /\[([^\]]+@[^\]]+)\]/g;

const FIELD_SOURCE_TYPES = new Set(['field', 'field_report', 'field_whatsapp', 'visits']);

/**
 * Human label for a source_type in citations (Field visit, Press, etc.).
 * @param {string|null|undefined} sourceType
 * @returns {string}
 */
export function sourceTypeCitationLabel(sourceType) {
  const st = String(sourceType ?? '').trim().toLowerCase();
  if (FIELD_SOURCE_TYPES.has(st)) return 'Field visit';
  if (st === 'radio') return 'Radio';
  if (st === 'pbo' || st === 'pbo_regional') return 'PBO report';
  if (st === 'naftali') return 'Naftali report';
  if (st === 'press' || st === 'news') return 'Press';
  if (st) return st;
  return 'Source';
}

const PBO_SOURCE_TYPES = new Set(['pbo', 'pbo_regional']);
const PRESS_SOURCE_TYPES = new Set(['press', 'news']);

/** ISO YYYY-MM-DD → {y, m, d} strings, or null when unparseable. */
function isoDateParts(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate ?? '').trim());
  return m ? { y: m[1], m: m[2], d: m[3] } : null;
}

/**
 * Municipality of a PBO signal, from the deterministic `pbo-<name>` unit id set
 * by the extract-unit builder. The same convention is read in
 * domain/services/signals/pboReviewStateResolution.js — keep them in step.
 *
 * @param {object|null|undefined} signal
 * @returns {string|null}
 */
export function pboMunicipalityForCitation(signal) {
  if (signal?.municipality) return String(signal.municipality).trim() || null;
  const source = String(signal?.article_source ?? '').trim();
  return source.startsWith('pbo-') ? source.slice('pbo-'.length) || null : null;
}

/**
 * Per-source-type inline citation date.
 *
 * PBO returns are a municipal report for a day, so the year adds nothing a
 * reader needs mid-sentence: `dd-mm`. Press is archival and dated precisely:
 * `dd:mm:yyyy`. Everything else keeps the APA `DD Mon YYYY` label.
 *
 * @param {object|null|undefined} signal
 * @param {string|null|undefined} isoDate ISO YYYY-MM-DD
 * @param {(iso: string) => string} apaFallback formatApaCitationDate
 * @returns {string}
 */
export function citationDateLabelForSignal(signal, isoDate, apaFallback) {
  const parts = isoDateParts(isoDate);
  if (!parts) return '';
  const st = String(signal?.source_type ?? '').trim().toLowerCase();
  if (PBO_SOURCE_TYPES.has(st)) return `${parts.d}-${parts.m}`;
  if (PRESS_SOURCE_TYPES.has(st)) return `${parts.d}:${parts.m}:${parts.y}`;
  return typeof apaFallback === 'function' ? apaFallback(isoDate) : '';
}

/**
 * @param {string|null|undefined} url
 * @returns {string|null}
 */
function cleanArticleUrl(url) {
  const u = String(url ?? '').trim();
  if (!u || u === '(no url)' || u === 'null') return null;
  return u;
}

/**
 * Derive APA-style author label from a signal's url, source_type, or article_source.
 * @param {object|null|undefined} signal
 * @returns {string}
 */
export function citationAuthorForSignal(signal) {
  const st = String(signal?.source_type ?? '').trim().toLowerCase();
  // PBO first: a municipal return is only interpretable with the municipality
  // named, and it carries no URL to fall back on.
  if (PBO_SOURCE_TYPES.has(st)) {
    const municipality = pboMunicipalityForCitation(signal);
    const label = sourceTypeCitationLabel(st);
    return municipality ? `${label}, ${municipality}` : label;
  }
  const url = cleanArticleUrl(signal?.article_url);
  if (url) return apaAuthorFromUrl(url);
  if (FIELD_SOURCE_TYPES.has(st)) return 'Field visit';
  if (st) return sourceTypeCitationLabel(signal?.source_type);
  const articleSource = String(signal?.article_source ?? '').trim();
  if (articleSource) return articleSource;
  return '';
}

/**
 * Build { author, url, sourceDate } APA source from a stored citation registry entry.
 * sourceDate is the per-source date (visit date for field visits, ISO YYYY-MM-DD);
 * null means the citation falls back to the report date.
 * @param {object} entry
 * @returns {{ author: string, url: string|null, sourceDate: string|null }|null}
 */
export function apaSourceFromSignalEntry(entry) {
  const signal = entry?.signal ?? entry;
  const author = citationAuthorForSignal(signal);
  if (!author) return null;
  const url = cleanArticleUrl(signal?.article_url);
  return {
    author,
    url,
    sourceDate: signal?.visit_date ?? null,
    // Carried so the resolver can pick the per-source-type date shape without
    // re-deriving source_type from a stripped-down source object.
    sourceType: signal?.source_type ?? null,
  };
}

/**
 * Build byLabel and byRef lookup maps from persisted citation registry rows.
 * @param {Array<object>|null|undefined} entries
 * @returns {{ byLabel: Map<string, object>, byRef: Map<string, object> }|null}
 */
export function buildCitationRegistryFromStored(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const byLabel = new Map();
  const byRef = new Map();

  for (const entry of entries) {
    if (!entry?.label) continue;
    const signal = {
      article_source: entry.article_source ?? null,
      article_url: entry.article_url ?? null,
      source_type: entry.source_type ?? null,
      visit_date: entry.signal_date ?? null,
    };
    const wrapped = {
      label: entry.label,
      ref: entry.ref ?? null,
      signal,
    };
    byLabel.set(entry.label, wrapped);
    if (entry.ref) byRef.set(entry.ref, wrapped);
  }

  if (byLabel.size === 0) return null;
  return { byLabel, byRef };
}

/**
 * Return true when prose contains resolvable citation markers ([S#], markdown links, internal refs).
 * @param {string} prose
 * @returns {boolean}
 */
export function proseHasResolvableCitations(prose) {
  if (typeof prose !== 'string' || !prose) return false;
  if (/\[S\d+\]/.test(prose)) return true;
  if (/\[[^\]]+\]\(https?:/.test(prose)) return true;
  return INTERNAL_REF_BRACKET.test(prose);
}
