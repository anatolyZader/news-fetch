/**
 * Resolve internal [S#] signal labels to APA in-text citations: (Author, DD Mon YYYY).
 */
import {
  apaAuthorLabel,
  formatApaCitationDate,
  formatApaParenthetical,
} from '../../../../../cross-cut-modules/resilience-contracts/apaCitationFormat.js';
import {
  citationLabelForSignal,
  resolveLabel,
} from './signalRefRegistry.js';

const SIGNAL_REF = /\[S(\d+)\]/g;
const SIGNAL_REF_GROUP = /\(\s*(\[S\d+\](?:\s*,\s*\[S\d+\])*)\s*\)/g;
const TRAILING_SIGNAL_REFS = /\s*(?:\[S\d+\])+\s*$/;
const MARKDOWN_LINK_RUN = /(?:\[[^\]]+\]\(https?:[^)\s]+\)\s*)+/g;

/**
 * @param {object} entry
 * @returns {{ author: string, url: string|null }|null}
 */
function apaSourceFromEntry(entry) {
  if (!entry?.signal) return null;
  const url = String(entry.signal.article_url ?? '').trim();
  const cleanUrl = url && url !== '(no url)' && url !== 'null' ? url : null;
  const author = apaAuthorLabel(citationLabelForSignal(entry.signal), cleanUrl ?? '');
  if (!author) return null;
  return { author, url: cleanUrl };
}

/**
 * @param {string} label e.g. S16
 * @param {{ byLabel?: Map<string, object> }} registry
 * @returns {{ author: string, url: string|null }|null}
 */
function sourceForLabel(label, registry) {
  const entry = resolveLabel(label, registry);
  if (!entry) return null;
  return apaSourceFromEntry(entry);
}

/**
 * @param {Array<{ author: string, url: string|null }>} sources
 * @param {string|null|undefined} reportDate
 * @param {{ linked?: boolean }} [opts]
 * @returns {string|null}
 */
function apaForSources(sources, reportDate, opts = {}) {
  const filtered = sources.filter((s) => s?.author);
  if (filtered.length === 0) return null;
  const dateLabel = formatApaCitationDate(reportDate);
  return formatApaParenthetical(filtered, dateLabel, opts);
}

/**
 * @param {string} inner e.g. [S1], [S2]
 * @param {{ byLabel?: Map<string, object> }} registry
 * @param {string|null|undefined} reportDate
 * @param {{ linked?: boolean }} [opts]
 * @returns {string|null}
 */
function apaFromRefGroup(inner, registry, reportDate, opts) {
  const labels = [...inner.matchAll(/\[S(\d+)\]/g)].map((m) => `S${m[1]}`);
  const sources = labels
    .map((label) => sourceForLabel(label, registry))
    .filter(Boolean);
  return apaForSources(sources, reportDate, opts);
}

/**
 * @param {string|null|undefined} prose
 * @param {{ byLabel?: Map<string, object> }} registry
 * @param {string|null|undefined} [reportDate]
 * @param {{ linked?: boolean }} [opts]
 * @returns {string}
 */
export function resolveInlineSignalCitations(prose, registry, reportDate = null, opts = {}) {
  if (typeof prose !== 'string' || !prose) return '';
  const { linked = false } = opts;
  const dateLabel = formatApaCitationDate(reportDate);

  let out = prose.replace(TRAILING_SIGNAL_REFS, '');

  if (registry?.byLabel?.size) {
    out = out.replaceAll(SIGNAL_REF_GROUP, (match, inner) => {
      const resolved = apaFromRefGroup(inner, registry, reportDate, { linked });
      return resolved ?? match;
    });

    out = out.replaceAll(SIGNAL_REF, (match) => {
      const label = match.slice(1, -1);
      const source = sourceForLabel(label, registry);
      if (!source) return '';
      return apaForSources([source], reportDate, { linked }) ?? '';
    });
  }

  if (dateLabel) {
    out = out.replaceAll(MARKDOWN_LINK_RUN, (run) => {
      const links = [...run.matchAll(/\[([^\]]+)\]\((https?:[^)\s]+)\)/gi)];
      if (links.length === 0) return run;
      const sources = links.map(([, text, url]) => ({
        author: apaAuthorLabel(text, url),
        url,
      }));
      const apa = formatApaParenthetical(sources, dateLabel, { linked }) || run;
      const hadTrailingSpace = /\s$/.test(run);
      return hadTrailingSpace && apa !== run ? `${apa} ` : apa;
    });
  }

  return out.replaceAll(/\s{2,}/g, ' ').replaceAll(' .', '.');
}
