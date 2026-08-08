/**
 * Namespace vocabulary for `narrative_claims[].signal_refs`.
 *
 * Pipeline position: shared by every consumer that resolves a claim citation —
 * narrative schema validation, post-hoc grounding QA, chat evidence bundles,
 * and the cross-report critique.
 *
 * Owns: the closed namespace vocabulary, namespace classification, and the
 * namespace-aware resolver.
 * Does NOT: build ref keys (`signalRefRegistry.js` owns `buildRefKey`), read
 * files, or call LLMs.
 *
 * Why this exists: claim refs arrive from three producers that do not share a
 * key space — the narrative signal registry (`{signal_type}@{articleKey}`), the
 * retrieval evidence graph (chunk/parent ids), and OOV clustering (`oov:<key>`).
 * They all land in one field. Without a discriminator, every consumer resolved
 * against the signal registry alone and reported perfectly good chunk citations
 * as broken — while genuinely broken signal refs hid in the same bucket.
 *
 * Key collaborators: `signalRefRegistry.js`, `narrativeGrounding/narrativeSchemaValidator.js`,
 * `narrativeGrounding/sentenceGroundingChecker.js`, `critique/crossReportCritique.js`.
 */

import { resolveRef } from './signalRefRegistry.js';

/** Closed vocabulary of claim-ref namespaces. */
export const CLAIM_REF_NAMESPACES = Object.freeze({
  /** `{signal_type}@{articleKey}` — resolvable against the signal registry. */
  SIGNAL: 'signal',
  /** `open:obs-3` — open-observation bundle, summarized rather than embedded in reports. */
  OPEN_OBSERVATION: 'open_observation',
  /** `oov:<clusterKey>` — out-of-vocabulary cluster from burst detection. */
  OOV: 'oov',
  /** Retrieval chunk / parent id from the evidence graph. */
  CHUNK: 'chunk',
  /** Fabricated or unparseable. */
  UNKNOWN: 'unknown',
});

/**
 * A signal ref is `{signal_type}@{articleKey}` where articleKey itself carries a
 * scheme (`url:`, `file:`, `idx:`, `src:`) or is the literal `unknown`.
 */
const SIGNAL_REF_RE = /^(?<type>[^@]+)@(?<articleKey>(?:url|file|idx|src):.+|unknown)$/;

/**
 * Legacy bare-index ref (`solidarity_help_others@1`) written before the evidence
 * graph was aligned on `buildRefKey`. Recognized so historical reports stay
 * readable; never produced by current code.
 */
const LEGACY_BARE_INDEX_REF_RE = /^(?<type>[^@]+)@(?<index>\d+)$/;

/**
 * Classify a claim ref into its producing namespace.
 *
 * @param {string} ref
 * @returns {{ namespace: string, signalType: string|null, articleKey: string|null, legacy: boolean }}
 */
export function classifyClaimRef(ref) {
  const raw = String(ref ?? '').trim();

  const signal = SIGNAL_REF_RE.exec(raw);
  if (signal) {
    return {
      namespace: CLAIM_REF_NAMESPACES.SIGNAL,
      signalType: signal.groups.type,
      articleKey: signal.groups.articleKey,
      legacy: false,
    };
  }

  const legacy = LEGACY_BARE_INDEX_REF_RE.exec(raw);
  if (legacy) {
    return {
      namespace: CLAIM_REF_NAMESPACES.SIGNAL,
      signalType: legacy.groups.type,
      articleKey: `idx:${legacy.groups.index}`,
      legacy: true,
    };
  }

  const base = { signalType: null, articleKey: null, legacy: false };
  if (raw.startsWith('open:')) return { ...base, namespace: CLAIM_REF_NAMESPACES.OPEN_OBSERVATION };
  if (raw.startsWith('oov:')) return { ...base, namespace: CLAIM_REF_NAMESPACES.OOV };
  if (raw.length > 0 && !raw.includes('@')) return { ...base, namespace: CLAIM_REF_NAMESPACES.CHUNK };
  return { ...base, namespace: CLAIM_REF_NAMESPACES.UNKNOWN };
}

/**
 * Canonical form of a claim ref — rewrites a legacy bare-index ref to the
 * current key so historical claims resolve against a current registry.
 *
 * @param {string} ref
 * @returns {string}
 */
export function canonicalClaimRef(ref) {
  const parsed = classifyClaimRef(ref);
  if (parsed.namespace !== CLAIM_REF_NAMESPACES.SIGNAL || !parsed.legacy) return String(ref ?? '');
  return `${parsed.signalType}@${parsed.articleKey}`;
}

/**
 * Resolve a claim ref against whichever store owns its namespace.
 *
 * Returns `resolved: false` with the namespace attached rather than a bare null,
 * so callers can tell "this citation is broken" from "this citation lives in a
 * store I was not given".
 *
 * @param {string} ref
 * @param {object} [stores]
 * @param {{ byRef?: Map<string, object> }} [stores.registry] signal registry
 * @param {Map<string, object>|null} [stores.chunksByRef] retrieval chunk/parent lookup
 * @param {Map<string, object>|null} [stores.openObservationsByRef] open-observation lookup
 * @returns {{ resolved: boolean, namespace: string, entry: object|null, legacy: boolean }}
 */
export function resolveClaimRef(ref, stores = {}) {
  const parsed = classifyClaimRef(ref);
  const result = { resolved: false, namespace: parsed.namespace, entry: null, legacy: parsed.legacy };

  switch (parsed.namespace) {
    case CLAIM_REF_NAMESPACES.SIGNAL: {
      const entry = resolveRef(canonicalClaimRef(ref), stores.registry);
      return entry ? { ...result, resolved: true, entry } : result;
    }
    case CLAIM_REF_NAMESPACES.OPEN_OBSERVATION: {
      const entry = stores.openObservationsByRef?.get(String(ref)) ?? null;
      return entry ? { ...result, resolved: true, entry } : result;
    }
    case CLAIM_REF_NAMESPACES.CHUNK:
    case CLAIM_REF_NAMESPACES.OOV: {
      const entry = stores.chunksByRef?.get(String(ref)) ?? null;
      return entry ? { ...result, resolved: true, entry } : result;
    }
    default:
      return result;
  }
}
