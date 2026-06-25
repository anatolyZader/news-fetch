/**
 * Build per-component signal pools for the operator narrative pipeline from the
 * full narrative scope (not scoring-partition-only signals).
 */
import { COMPONENT_IDS } from '../../../../cross-cut-modules/resilience-contracts/componentIds.js';
import { buildDuplicateOccurrenceIndex } from '../epistemic/massContribution.js';
import { collectComponentItems } from '../epistemic/componentItems.js';
import { defaultSignalWeights } from '../epistemic/signalWeights.js';
import { buildRefKey } from './narrativeGrounding/signalRefRegistry.js';

const SUPPRESSION_KEYS = [
  'suppression_delta',
  'source_cap_binding',
  'floor_clamped',
  'suppression_breakdown',
  'score_raw',
  'score_headline',
  'score',
  'positive_evidence',
  'negative_evidence',
  'derived_indicators',
];

/**
 * @param {object|null|undefined} scoredFull
 * @param {string} componentId
 * @returns {object}
 */
function suppressionSliceFromScored(scoredFull, componentId) {
  const scored = scoredFull?.[componentId];
  if (!scored || typeof scored !== 'object') return {};
  const out = {};
  for (const key of SUPPRESSION_KEYS) {
    if (scored[key] != null) out[key] = scored[key];
  }
  return out;
}

/**
 * @param {object[]} narrativeScopeSignals
 * @param {Record<string, object>|null} [scoredFull]
 * @returns {Record<string, { signals: object[], signal_count: number }>}
 */
export function buildNarrativeScoredComponents(narrativeScopeSignals, scoredFull = null) {
  const signals = narrativeScopeSignals ?? [];
  const signalWeights = defaultSignalWeights();
  const duplicateIndex = buildDuplicateOccurrenceIndex(signals);
  const out = {};

  for (const componentId of COMPONENT_IDS) {
    const { items } = collectComponentItems(componentId, signals, duplicateIndex, signalWeights);
    const componentSignals = items.map((item) => {
      const signal = { ...item.signal };
      if (item.polarity === '-') signal._polarity = '-';
      return signal;
    });

    out[componentId] = {
      ...suppressionSliceFromScored(scoredFull, componentId),
      signals: componentSignals,
      signal_count: componentSignals.length,
    };
  }

  return out;
}

/**
 * Normalize agent assessment claims to narrative_claims shape.
 * @param {object} comp
 * @returns {object[]}
 */
export function agentClaimsForComponent(comp) {
  const fromNarrativeClaims = comp?.narrative_claims;
  if (Array.isArray(fromNarrativeClaims) && fromNarrativeClaims.length > 0) {
    return fromNarrativeClaims
      .filter((c) => c?.text && (c.signal_refs ?? c.evidence_refs ?? []).length > 0)
      .map((c) => ({
        text: String(c.text),
        signal_refs: [...(c.signal_refs ?? c.evidence_refs ?? [])],
        relation: c.relation ?? 'parallel',
      }));
  }

  const fromClaims = comp?.claims;
  if (!Array.isArray(fromClaims)) return [];

  return fromClaims
    .filter((c) => c?.text && (c.evidence_refs ?? c.signal_refs ?? []).length > 0)
    .map((c) => ({
      text: String(c.text),
      signal_refs: [...(c.evidence_refs ?? c.signal_refs ?? [])],
      relation: c.relation ?? 'parallel',
    }));
}

function claimDedupeKey(claim) {
  const refs = [...(claim.signal_refs ?? [])].sort((a, b) => a.localeCompare(b)).join('|');
  return `${String(claim.text ?? '').trim().toLowerCase()}::${refs}`;
}

/**
 * Merge agent claims (preferred) with Haiku facts-pass claims.
 * @param {object[]} agentClaims
 * @param {object[]} factsClaims
 * @returns {object[]}
 */
export function mergeClaimsLists(agentClaims, factsClaims) {
  const merged = [];
  const seen = new Set();

  for (const claim of agentClaims ?? []) {
    const key = claimDedupeKey(claim);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(claim);
  }

  for (const claim of factsClaims ?? []) {
    const key = claimDedupeKey(claim);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(claim);
  }

  return merged;
}

/**
 * @param {object} assessment
 * @param {Record<string, object[]>} factsByComponent
 * @returns {{ components: Array<{ component_id: string, narrative_claims: object[] }> }}
 */
export function mergeAgentClaimsWithFacts(assessment, factsByComponent) {
  const components = [];
  for (const componentId of COMPONENT_IDS) {
    const comp = (assessment?.components ?? []).find((c) => c.component_id === componentId);
    const agentClaims = agentClaimsForComponent(comp ?? {});
    const factsClaims = factsByComponent?.[componentId] ?? [];
    const narrative_claims = mergeClaimsLists(agentClaims, factsClaims);
    if (narrative_claims.length > 0) {
      components.push({ component_id: componentId, narrative_claims });
    }
  }
  return { components };
}

/**
 * Deterministic one-line claims from digest signals (degrade level 3+).
 * @param {Record<string, object>} narrativeScored
 * @param {{ byComponent: Record<string, Array<{ ref: string, signal: object }>> }} registry
 * @returns {Record<string, object[]>}
 */
export function buildDigestStubClaims(narrativeScored, registry) {
  const byComponent = {};
  for (const componentId of COMPONENT_IDS) {
    const entries = registry?.byComponent?.[componentId] ?? [];
    const claims = [];
    for (const entry of entries) {
      const evidence = String(entry.signal?.evidence ?? '').trim();
      if (!evidence) continue;
      const ref = entry.ref ?? buildRefKey(entry.signal);
      claims.push({
        text: evidence.slice(0, 280),
        signal_refs: [ref],
        relation: 'parallel',
      });
    }
    if (claims.length > 0) {
      byComponent[componentId] = claims;
    }
  }
  return byComponent;
}

/**
 * Fill missing facts-pass claims with capped digest stubs when signals exist.
 * @param {Record<string, object[]>} factsByComponent
 * @param {{ byComponent: Record<string, object[]> }} registry
 * @param {{ maxClaimsPerComponent?: number }} [opts]
 * @returns {Record<string, object[]>}
 */
export function supplementFactsWithDigestStubs(factsByComponent, registry, opts = {}) {
  const maxClaims = opts.maxClaimsPerComponent ?? 8;
  const stubs = buildDigestStubClaims(null, registry);
  const out = factsByComponent ? { ...factsByComponent } : {};

  for (const componentId of COMPONENT_IDS) {
    const hasSignals = (registry?.byComponent?.[componentId] ?? []).length > 0;
    const hasFacts = (out[componentId] ?? []).length > 0;
    if (hasSignals && !hasFacts && stubs[componentId]?.length) {
      out[componentId] = stubs[componentId].slice(0, maxClaims);
    }
  }

  return out;
}
