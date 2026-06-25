/**
 * Resolve internal [S#] signal labels to markdown [source](url) for APA client formatting.
 */
import {
  citationLabelForSignal,
  resolveLabel,
} from './signalRefRegistry.js';

const SIGNAL_REF = /\[S(\d+)\]/g;
const SIGNAL_REF_GROUP = /\(\s*(\[S\d+\](?:\s*,\s*\[S\d+\])*)\s*\)/g;
const TRAILING_SIGNAL_REFS = /\s*(?:\[S\d+\])+\s*$/;

/**
 * @param {object} entry
 * @returns {string|null}
 */
function markdownCitationForEntry(entry) {
  if (!entry?.signal) return null;
  const url = String(entry.signal.article_url ?? '').trim();
  if (!url || url === '(no url)' || url === 'null') return null;
  const label = citationLabelForSignal(entry.signal);
  if (!label || label === 'source') return `[source](${url})`;
  return `[${label}](${url})`;
}

/**
 * @param {string} label e.g. S16
 * @param {{ byLabel?: Map<string, object> }} registry
 * @returns {string|null}
 */
function citationForLabel(label, registry) {
  const entry = resolveLabel(label, registry);
  if (!entry) return null;
  return markdownCitationForEntry(entry);
}

/**
 * @param {string} inner e.g. [S1], [S2]
 * @param {{ byLabel?: Map<string, object> }} registry
 * @returns {string|null}
 */
function citationsFromRefGroup(inner, registry) {
  const labels = [...inner.matchAll(/\[S(\d+)\]/g)].map((m) => `S${m[1]}`);
  const citations = labels
    .map((label) => citationForLabel(label, registry))
    .filter(Boolean);
  if (citations.length === 0) return null;
  return `(${citations.join(', ')})`;
}

/**
 * @param {string|null|undefined} prose
 * @param {{ byLabel?: Map<string, object> }} registry
 * @returns {string}
 */
export function resolveInlineSignalCitations(prose, registry) {
  if (typeof prose !== 'string' || !prose) return '';
  if (!registry?.byLabel?.size) return prose;

  let out = prose.replace(TRAILING_SIGNAL_REFS, '');

  out = out.replace(SIGNAL_REF_GROUP, (match, inner) => {
    const resolved = citationsFromRefGroup(inner, registry);
    return resolved ?? match;
  });

  out = out.replace(SIGNAL_REF, (match) => {
    const label = match.slice(1, -1);
    return citationForLabel(label, registry) ?? '';
  });

  return out.replaceAll(/\s{2,}/g, ' ').replaceAll(' .', '.');
}
