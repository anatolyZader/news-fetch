/**
 * Shared signal-resolution and evidence-bullet formatting utilities for the
 * operator surfaces, plus routing rationale labels for rendered evidence
 * bullets.
 *
 * Evidence attaches to a component purely via the signal_type → component
 * routing table (signalRouting.js); the label makes that rationale visible so
 * an item never looks arbitrary under its component. Shared by the rich
 * investigation pool and the claims-derived fallback (import from both
 * operatorInvestigationSurface.js and operatorNarrativeSurface.js would
 * otherwise create a cycle) — this module must never import from either
 * surface file.
 */
import {
  operatorSurfaceMode,
  operatorEvidenceChars,
} from '../../contracts/operatorSurfaceMode.js';
import { buildRefKey } from '../narrativeGrounding/signalRefRegistry.js';

const MAX_EVIDENCE_LINE_CHARS = 480;
const SIGNAL_REF_TRAILING = /\s*(?:\[S\d+\])+\s*$/;

export function isRichSurfaceMode() {
  return operatorSurfaceMode() === 'rich';
}

export function maxEvidenceLineChars() {
  return isRichSurfaceMode() ? operatorEvidenceChars() : MAX_EVIDENCE_LINE_CHARS;
}

/**
 * @param {string} refKey
 * @returns {string|null}
 */
const URL_FROM_REF_KEY = /@url:(.+)$/;

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
 * @param {string} ref
 * @param {object} comp
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
 * @param {string} text
 * @returns {string}
 */
export function stripTrailingSignalRefs(text) {
  return String(text ?? '').replace(SIGNAL_REF_TRAILING, '').trim();
}

/**
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
 * @param {string|null|undefined} sourceType
 * @returns {string|null}
 */
export function normalizeSourceType(sourceType) {
  const st = String(sourceType ?? '').trim().toLowerCase();
  if (!st) return null;
  if (st === 'news' || st === 'press') return 'press';
  if (st === 'field' || st === 'visits') return 'field';
  return st;
}

/**
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

/**
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
 * @param {{ signal_type?: string|null, routing_role?: string|null, routing_weight?: number|null }} item
 * @returns {string}
 */
export function routingLabelSuffix(item) {
  if (!item?.signal_type) return '';
  const role = item.routing_role ?? 'primary';
  const w = item.routing_weight;
  let weightPart = '';
  if (Number.isFinite(w)) {
    const sign = w > 0 ? '+' : '';
    weightPart = ` ${sign}${w}`;
  }
  return ` \`${item.signal_type} · ${role}${weightPart}\``;
}

/**
 * How inferred-edge items render in the evidence list, from the
 * RESILIENCE_POOL_INFERRED_RENDER env var: 'label' (default — keep, labeled,
 * sorted after primary) or 'hide' (drop from the rendered list; the item
 * still exists in the pool JSON).
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'label'|'hide'}
 */
export function inferredPoolRenderMode(env = process.env) {
  return env.RESILIENCE_POOL_INFERRED_RENDER === 'hide' ? 'hide' : 'label';
}

/**
 * Primary-edge items first, then by descending scoring contribution.
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
