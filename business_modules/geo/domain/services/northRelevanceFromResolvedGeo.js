import { districtRelevanceFromResolvedGeo } from './districtRelevanceFromResolvedGeo.js';

/**
 * @param {object | null | undefined} g — resolved envelope
 * @returns {ReturnType<typeof districtRelevanceFromResolvedGeo> & { isNorthRelevant: boolean }}
 */
export function northRelevanceFromResolvedGeo(g) {
  const d = districtRelevanceFromResolvedGeo('north', g);
  return {
    ...d,
    isNorthRelevant: d.isRelevant,
  };
}
