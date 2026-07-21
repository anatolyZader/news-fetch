/**
 * Shared signal-resolution and evidence-bullet formatting for operator surfaces.
 *
 * Pipeline position: finalize narrative/investigation surfaces — shared to avoid
 * import cycles between operatorInvestigationSurface and operatorNarrativeSurface.
 *
 * Owns: signal ref resolution, evidence bullet markdown, routing label suffixes,
 * pool sort order for rich surface mode.
 * Does NOT: build investigation pools, run LLM narrative, or route signals to components.
 *
 * Key collaborators: `narrativeGrounding/signalRefRegistry.js`, `contracts/operatorSurfaceMode.js`,
 * `signals/routing/signalRouter.js`, both operator surface finalize modules.
 */

import {
  operatorSurfaceMode,
  operatorEvidenceChars,
} from '../../contracts/operatorSurfaceMode.js';
import { buildRefKey } from '../narrativeGrounding/signalRefRegistry.js';

const MAX_EVIDENCE_LINE_CHARS = 480;
const SIGNAL_REF_TRAILING = /\s*(?:\[S\d+\])+\s*$/;

// ── Surface mode helpers ──────────────────────────────────────────────────────

/**
 * Whether operator surface is in rich mode (full pool + extended evidence chars).
 *
 * @returns {boolean}
 */
export function isRichSurfaceMode() {
  return operatorSurfaceMode() === 'rich';
}

/**
 * Max characters per evidence line for current surface mode.
 *
 * @returns {number}
 */
export function maxEvidenceLineChars() {
  return isRichSurfaceMode() ? operatorEvidenceChars() : MAX_EVIDENCE_LINE_CHARS;
}

// ── Signal ref resolution ─────────────────────────────────────────────────────

const URL_FROM_REF_KEY = /@url:(.+)$/;

/**
 * Extract article URL embedded in a signal ref key.
 *
 * @param {string} refKey
 * @returns {string|null}
 */
export function urlFromRefKey(refKey) {
  const s = String(refKey ?? '');
  const match = URL_FROM_REF_KEY.exec(s);
  if (!match) return null;
  const url = match[1].trim();
  if (!url || url === '(no url)' || url === 'null') return null;
  return url;
}

/**
 * @param {object} comp
 * @returns {object[]}
 */
function signalPoolsFromComponent(comp) {
  const poolItems = (comp?.operator_investigation_pool ?? []).map((item) => ({
    signal_type: item.signal_type,
    type: item.signal_type,
    evidence: item.evidence,
    article_url: item.url,
    source_type: item.source_type,
    article_source: item.article_source,
    signalProvenance: item.signal_provenance,
  }));
  return [
    ...poolItems,
    ...(comp?.signals ?? []),
    ...(comp?.top_contributors ?? []),
  ];
}

/**
 * Resolve a signal object from a ref key against component pools.
 *
 * @param {string} ref
 * @param {object} comp Component with operator_investigation_pool / signals.
 * @returns {object|null}
 */
export function resolveSignalForRef(ref, comp) {
  const refKey = String(ref ?? '').trim();
  if (!refKey) return null;
  const pool = signalPoolsFromComponent(comp);
  for (const signal of pool) {
    if (buildRefKey(signal) === refKey) return signal;
  }
  const idxMatch = /^(.+)@idx:(\d+)$/.exec(refKey);
  if (idxMatch) {
    const [, signalType, idxStr] = idxMatch;
    const articleIndex = Number(idxStr);
    const byIdx = pool.find(
      (s) => (s?.signal_type ?? s?.type) === signalType && s?.article_index === articleIndex,
    );
    if (byIdx) return byIdx;
  }
  const url = urlFromRefKey(refKey);
  if (url) {
    return pool.find((s) => s?.article_url === url) ?? null;
  }
  return null;
}

// ── Metadata extraction ───────────────────────────────────────────────────────

/**
 * @param {object|null|undefined} signal
 * @returns {string|null}
 */
export function urlFromSignal(signal) {
  const url = signal?.article_url;
  if (!url || url === '(no url)' || url === 'null') return null;
  return url;
}

/**
 * Strip trailing [S#] labels from claim text before prose assembly.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripTrailingSignalRefs(text) {
  return String(text ?? '').replace(SIGNAL_REF_TRAILING, '').trim();
}

/**
 * Extract source metadata from a resolved signal.
 *
 * @param {object|null|undefined} signal
 * @returns {{ source_type: string|null, article_source: string|null, url: string|null }}
 */
export function metaFromSignal(signal) {
  if (!signal) return { source_type: null, article_source: null, url: null };
  return {
    source_type: normalizeSourceType(signal.source_type),
    article_source: signal.article_source ?? null,
    url: urlFromSignal(signal),
  };
}

/**
 * Resolve first URL from claim signal refs.
 *
 * @param {object} claim
 * @param {object} [comp]
 * @returns {string|null}
 */
export function urlFromClaim(claim, comp) {
  const refs = claim.signal_refs ?? claim.evidence_refs ?? [];
  for (const ref of refs) {
    const url = urlFromRefKey(ref);
    if (url) return url;
    if (comp) {
      const signalUrl = urlFromSignal(resolveSignalForRef(ref, comp));
      if (signalUrl) return signalUrl;
    }
  }
  return null;
}

/**
 * Normalize source_type aliases (news→press, visits→field).
 *
 * @param {string|null|undefined} sourceType
 * @returns {string|null}
 */
export function normalizeSourceType(sourceType) {
  const st = String(sourceType ?? '').trim().toLowerCase();
  if (!st) return null;
  if (st === 'news' || st === 'press') return 'press';
  if (st === 'visits' || st === 'field') return 'visits';
  return st;
}

/**
 * Derive source metadata for a claim via its signal refs.
 *
 * @param {object} claim
 * @param {object} comp
 * @returns {{ source_type: string|null, article_source: string|null }}
 */
export function sourceMetaFromClaim(claim, comp) {
  if (claim?.source_type) {
    return {
      source_type: normalizeSourceType(claim.source_type),
      article_source: claim.article_source ?? null,
    };
  }
  const refs = claim.signal_refs ?? claim.evidence_refs ?? [];
  for (const ref of refs) {
    const signal = resolveSignalForRef(ref, comp);
    if (signal) return metaFromSignal(signal);
  }
  const url = urlFromClaim(claim, comp);
  for (const signal of signalPoolsFromComponent(comp)) {
    if (url && signal?.article_url && signal.article_url === url) {
      return metaFromSignal(signal);
    }
  }
  if (url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      return { source_type: null, article_source: host || null };
    } catch {
      return { source_type: null, article_source: null };
    }
  }
  return { source_type: null, article_source: null };
}

// ── Evidence bullet formatting ────────────────────────────────────────────────

/**
 * Format a single markdown evidence bullet with optional source link.
 *
 * @param {string} text
 * @param {string|null} url
 * @returns {string}
 */
export function formatEvidenceBullet(text, url) {
  const body = String(text ?? '').trim().slice(0, maxEvidenceLineChars());
  if (!body) return '';
  if (url) return `- ${body} [source](${url})`;
  return `- ${body}`;
}

/**
 * Backtick code-span suffix, e.g. " `institutional_abandonment_perception · primary -0.9`".
 * Placed after the [source] link as a directionally neutral ASCII run — safe
 * to append to RTL (Hebrew) evidence text.
 *
 * @param {{ signal_type?: string|null, routing_role?: string|null }} item
 * @returns {string}
 */
export function routingLabelSuffix(item) {
  if (!item?.signal_type) return '';
  const role = item.routing_role ?? 'primary';
  return ` \`${item.signal_type} · ${role}\``;
}

// ── Pool rendering ────────────────────────────────────────────────────────────

/**
 * How inferred-edge items render in the evidence list (label vs hide).
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'label'|'hide'}
 */
export function inferredPoolRenderMode(env = process.env) {
  return env.RESILIENCE_POOL_INFERRED_RENDER === 'hide' ? 'hide' : 'label';
}

/**
 * Sort pool items: primary edges first, then by contribution rank.
 *
 * @param {{ routing_role?: string, contribution?: number }} a
 * @param {{ routing_role?: string, contribution?: number }} b
 * @returns {number}
 */
export function comparePoolItems(a, b) {
  const aInferred = a?.routing_role === 'inferred';
  const bInferred = b?.routing_role === 'inferred';
  if (aInferred !== bInferred) return aInferred ? 1 : -1;
  return (b?.contribution ?? 0) - (a?.contribution ?? 0);
}
