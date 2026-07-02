/**
 * Operator-facing citation labels and registry helpers (server + client).
 */
import { apaAuthorFromUrl } from './apaCitationFormat.js';

/** Bracketed internal signal refs: [type@idx:N], [type@url:…], [type@file:…] */
export const INTERNAL_REF_BRACKET = /\[([^\]]+@[^\]]+)\]/g;

const FIELD_SOURCE_TYPES = new Set(['field', 'field_report', 'field_whatsapp', 'visits']);

/**
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
 * @param {object|null|undefined} signal
 * @returns {string}
 */
export function citationAuthorForSignal(signal) {
  const url = cleanArticleUrl(signal?.article_url);
  if (url) return apaAuthorFromUrl(url);
  const st = String(signal?.source_type ?? '').trim().toLowerCase();
  if (FIELD_SOURCE_TYPES.has(st)) return 'Field visit';
  if (st) return sourceTypeCitationLabel(signal?.source_type);
  const articleSource = String(signal?.article_source ?? '').trim();
  if (articleSource) return articleSource;
  return '';
}

/**
 * @param {object} entry
 * @returns {{ author: string, url: string|null }}
 */
export function apaSourceFromSignalEntry(entry) {
  const signal = entry?.signal ?? entry;
  const author = citationAuthorForSignal(signal);
  if (!author) return null;
  const url = cleanArticleUrl(signal?.article_url);
  return { author, url };
}

/**
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
 * @param {string} prose
 * @returns {boolean}
 */
export function proseHasResolvableCitations(prose) {
  if (typeof prose !== 'string' || !prose) return false;
  if (/\[S\d+\]/.test(prose)) return true;
  if (/\[[^\]]+\]\(https?:/.test(prose)) return true;
  return INTERNAL_REF_BRACKET.test(prose);
}
