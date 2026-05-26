import { northRelevanceFromResolvedGeo } from './northRelevanceFromResolvedGeo.js';

/**
 * North relevance implied by a **resolved** geo envelope alone (tags, PBO id, metrics gate).
 * For full signal-level north scoping (source_type, resolved geo), see
 * `scopeDecisionForSignal` in `regionSignalFilter.js` — it may attach `signal.scopeDecision`.
 */

/**
 * @param {Parameters<typeof northRelevanceFromResolvedGeo>[0]} g
 * @returns {ReturnType<typeof northRelevanceFromResolvedGeo>}
 */
export function buildGeoScopeDecision(g) {
  return northRelevanceFromResolvedGeo(g);
}
