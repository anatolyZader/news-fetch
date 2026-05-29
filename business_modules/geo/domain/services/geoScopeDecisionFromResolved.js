import { northRelevanceFromResolvedGeo } from './northRelevanceFromResolvedGeo.js';
import { homeFrontDistrictIdsFromResolvedGeo } from './districtRelevanceFromResolvedGeo.js';

/**
 * Scope decision implied by a **resolved** geo envelope alone (tags, PBO id, metrics gate).
 * For full signal-level scoping, see `scopeDecisionForSignal` in `regionSignalFilter.js`.
 */

/**
 * @param {Parameters<typeof northRelevanceFromResolvedGeo>[0]} g
 * @returns {ReturnType<typeof northRelevanceFromResolvedGeo> & { homeFrontDistrictIds: string[] }}
 */
export function buildGeoScopeDecision(g) {
  const north = northRelevanceFromResolvedGeo(g);
  return {
    ...north,
    homeFrontDistrictIds: homeFrontDistrictIdsFromResolvedGeo(g),
  };
}
