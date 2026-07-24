/**
 * Claim normalization and merging for the operator narrative pipeline.
 *
 * Pipeline position: between specialist agent output and narrative LLM / operator
 * narrative surface finalize.
 *
 * Owns: agentClaimsForComponent shape normalization, merge with facts-pass claims,
 * digest stub claims for degrade levels.
 * Does NOT: run LLM or compute narrative_grounding_score (post-hoc QA elsewhere).
 *
 * Key collaborators: `narrative/signalRefRegistry.js`, `operator/operatorNarrativeSurface.js`,
 * narrative LLM orchestrator in app layer.
 */

import { COMPONENT_IDS } from '../../contracts/componentIds.js';
import { buildRefKey } from './signalRefRegistry.js';

/**
 * @param {object[]} claims
 * @param {'signal_refs'|'evidence_refs'} primaryRefKey Preferred refs field; the other is fallback.
 * @returns {object[]}
 */
function normalizeClaims(claims, primaryRefKey) {
  const fallbackRefKey = primaryRefKey === 'signal_refs' ? 'evidence_refs' : 'signal_refs';
  return claims
    .filter((c) => c?.text && (c[primaryRefKey] ?? c[fallbackRefKey] ?? []).length > 0)
    .map((c) => ({
      text: String(c.text),
      signal_refs: [...(c[primaryRefKey] ?? c[fallbackRefKey] ?? [])],
      relation: c.relation ?? 'parallel',
    }));
}

/**
 * Normalize agent assessment claims to narrative_claims shape.
 * @param {object} comp
 * @returns {object[]}
 */
export function agentClaimsForComponent(comp) {
  const fromNarrativeClaims = comp?.narrative_claims;
  if (Array.isArray(fromNarrativeClaims) && fromNarrativeClaims.length > 0) {
    return normalizeClaims(fromNarrativeClaims, 'signal_refs');
  }

  const fromClaims = comp?.claims;
  if (!Array.isArray(fromClaims)) return [];
  return normalizeClaims(fromClaims, 'evidence_refs');
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
 * @param {{ byComponent: Record<string, Array<{ ref: string, signal: object }>> }} registry
 * @returns {Record<string, object[]>}
 */
export function buildDigestStubClaims(registry) {
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
  const stubs = buildDigestStubClaims(registry);
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
