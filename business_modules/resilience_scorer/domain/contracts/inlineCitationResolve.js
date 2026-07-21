/**
 * Inline citation resolution — [S#], internal refs, and markdown links to APA.
 *
 * Pipeline position: report display (server + client) — post-processes narrative
 * prose into linked APA parentheticals. Client-safe isomorphic.
 *
 * Owns: resolveInlineSignalCitations, linkPlainApaParentheticals.
 * Does NOT: build citation registries (citationDisplay.js) or APA date formatting alone.
 *
 * Key collaborators: apaCitationFormat.js, citationDisplay.js, evidenceAnchor.js,
 * client report narrative components.
 */
import {
  apaAuthorLabel,
  formatApaCitationDate,
  formatApaParenthetical,
} from './apaCitationFormat.js';
import {
  apaSourceFromSignalEntry,
  INTERNAL_REF_BRACKET,
} from './citationDisplay.js';
import { evidenceAnchorHref } from './evidenceAnchor.js';

const SIGNAL_REF = /\[S(\d+)\]/g;
const SIGNAL_REF_GROUP = /\(\s*(\[S\d+\](?:\s*,\s*\[S\d+\])*)\s*\)/g;
const TRAILING_SIGNAL_REFS = /\s*(?:\[S\d+\])+\s*$/;
const MARKDOWN_LINK_RUN = /(?:\[[^\]]+\]\(https?:[^)\s]+\)\s*)+/g;

/**
 * @param {object} entry
 * @returns {{ author: string, url: string|null, ref: string|null }|null}
 */
function apaSourceFromEntry(entry) {
  if (!entry?.signal) return null;
  const source = apaSourceFromSignalEntry(entry);
  if (!source?.author) return null;
  return {
    ...source,
    ref: entry.ref ?? null,
  };
}

/**
 * @param {string} label
 * @param {{ byLabel?: Map<string, object> }} registry
 * @returns {object|null}
 */
function resolveLabel(label, registry) {
  return registry?.byLabel?.get(label) ?? null;
}

/**
 * @param {string} refKey
 * @param {{ byRef?: Map<string, object> }} registry
 * @returns {object|null}
 */
function resolveRef(refKey, registry) {
  return registry?.byRef?.get(refKey) ?? null;
}

/**
 * @param {string} label
 * @param {{ byLabel?: Map<string, object> }} registry
 * @returns {{ author: string, url: string|null, ref: string|null }|null}
 */
function sourceForLabel(label, registry) {
  const entry = resolveLabel(label, registry);
  if (!entry) return null;
  return apaSourceFromEntry(entry);
}

/**
 * @param {string} refKey
 * @param {{ byRef?: Map<string, object> }} registry
 * @returns {{ author: string, url: string|null, ref: string|null }|null}
 */
function sourceForRefKey(refKey, registry) {
  const entry = resolveRef(refKey, registry);
  if (!entry) return null;
  return apaSourceFromEntry(entry);
}

/**
 * @param {{ author: string, url?: string|null, ref?: string|null }} source
 * @param {string|null|undefined} componentId
 * @returns {string|null}
 */
function evidenceHrefForSource(source, componentId) {
  if (!componentId || !source?.ref) return null;
  return evidenceAnchorHref(componentId, source.ref);
}

/**
 * @param {Array<{ author: string, url?: string|null, ref?: string|null }>} sources
 * @param {string|null|undefined} reportDate
 * @param {{ linked?: boolean, linkMode?: string, componentId?: string|null }} [opts]
 * @returns {string|null}
 */
function apaForSources(sources, reportDate, opts = {}) {
  const { linked = false, linkMode = 'external', componentId = null } = opts;
  const enriched = sources
    .filter((s) => s?.author)
    .map((s) => ({
      author: s.author,
      url: s.url ?? null,
      evidenceHref: linkMode === 'evidence'
        ? evidenceHrefForSource(s, componentId)
        : null,
    }));
  if (enriched.length === 0) return null;
  const dateLabel = formatApaCitationDate(reportDate);
  return formatApaParenthetical(enriched, dateLabel, { linked, linkMode });
}

/**
 * @param {string} inner
 * @param {{ byLabel?: Map<string, object> }} registry
 * @param {string|null|undefined} reportDate
 * @param {object} [opts]
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
 * @param {{ byLabel?: Map<string, object>, byRef?: Map<string, object> }|null} registry
 * @param {string|null|undefined} [reportDate]
 * @param {{ linked?: boolean, resolveMarkdown?: boolean, linkMode?: string, componentId?: string|null }} [opts]
 * @returns {string}
 */
export function resolveInlineSignalCitations(prose, registry, reportDate = null, opts = {}) {
  if (typeof prose !== 'string' || !prose) return '';
  const {
    linked = false,
    resolveMarkdown = true,
    linkMode = 'external',
    componentId = null,
  } = opts;
  const dateLabel = formatApaCitationDate(reportDate);
  const resolveOpts = { linked, linkMode, componentId };

  let out = prose.replace(TRAILING_SIGNAL_REFS, '');

  if (registry?.byRef?.size) {
    out = out.replaceAll(INTERNAL_REF_BRACKET, (match, refKey) => {
      const source = sourceForRefKey(refKey, registry);
      if (!source) return match;
      return apaForSources([source], reportDate, resolveOpts) ?? match;
    });
  }

  if (registry?.byLabel?.size) {
    out = out.replaceAll(SIGNAL_REF_GROUP, (match, inner) => {
      const resolved = apaFromRefGroup(inner, registry, reportDate, resolveOpts);
      return resolved ?? match;
    });

    out = out.replaceAll(SIGNAL_REF, (match) => {
      const label = match.slice(1, -1);
      const source = sourceForLabel(label, registry);
      if (!source) return '';
      return apaForSources([source], reportDate, resolveOpts) ?? '';
    });
  }

  if (resolveMarkdown && dateLabel) {
    out = out.replaceAll(MARKDOWN_LINK_RUN, (run) => {
      const links = [...run.matchAll(/\[([^\]]+)\]\((https?:[^)\s]+)\)/gi)];
      if (links.length === 0) return run;
      const sources = links.map(([, text, url]) => {
        const author = apaAuthorLabel(text, url);
        const entry = registry?.byRef
          ? [...registry.byRef.values()].find((e) => {
            const signalUrl = String(e?.signal?.article_url ?? '').trim();
            return signalUrl && signalUrl === url;
          })
          : null;
        return {
          author,
          url,
          ref: entry?.ref ?? null,
        };
      });
      const apa = formatApaParenthetical(
        sources.map((s) => ({
          author: s.author,
          url: s.url,
          evidenceHref: linkMode === 'evidence'
            ? evidenceHrefForSource(s, componentId)
            : null,
        })),
        dateLabel,
        { linked, linkMode },
      ) || run;
      const hadTrailingSpace = /\s$/.test(run);
      return hadTrailingSpace && apa !== run ? `${apa} ` : apa;
    });
  }

  return out.replaceAll(/\s{2,}/g, ' ').replaceAll(' .', '.');
}

/**
 * Retrofit plain APA parentheticals `(author, DD Mon YYYY)` with evidence anchor links.
 * @param {string} prose
 * @param {{ byRef?: Map<string, object> }} registry
 * @param {string|null|undefined} reportDate
 * @param {string|null|undefined} componentId
 * @returns {string}
 */
export function linkPlainApaParentheticals(prose, registry, reportDate, componentId) {
  if (typeof prose !== 'string' || !prose || !registry?.byRef?.size || !componentId) {
    return prose ?? '';
  }
  const dateLabel = formatApaCitationDate(reportDate);
  if (!dateLabel) return prose;
  if (/\]\(#evidence-/.test(prose)) return prose;

  const entries = [...registry.byRef.values()];
  const authorToRefs = new Map();
  for (const entry of entries) {
    const source = apaSourceFromEntry(entry);
    if (!source?.author || !entry.ref) continue;
    const list = authorToRefs.get(source.author) ?? [];
    list.push({ ref: entry.ref, source });
    authorToRefs.set(source.author, list);
  }

  const escapedDateLabel = dateLabel.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  return prose.replaceAll(
    new RegExp(String.raw`\(([^()]+?,\s*${escapedDateLabel}(?:;\s*[^()]+?,\s*${escapedDateLabel})*)\)`, 'g'),
    (full, inner) => {
      const parts = inner.split(/\s*;\s*/);
      const linkedParts = parts.map((part) => {
        const trimmed = part.trim();
        if (/\[.+\]\(#evidence-/.test(trimmed)) return trimmed;
        const m = /^(.+?),\s*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})$/.exec(trimmed);
        if (!m) return trimmed;
        const [, authorRaw, datePart] = m;
        const author = authorRaw.trim();
        const matches = authorToRefs.get(author) ?? [];
        if (matches.length !== 1) return trimmed;
        const href = evidenceAnchorHref(componentId, matches[0].ref);
        return `[${author}](${href}), ${datePart}`;
      });
      return `(${linkedParts.join('; ')})`;
    },
  );
}
