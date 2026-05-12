/**
 * North relevance implied by a **resolved** geo envelope alone (tags, PBO id, metrics gate).
 * For full signal-level north scoping (source_type, keyword fallback), see
 * `scopeDecisionForSignal` in `regionSignalFilter.js` — it may attach `signal.scopeDecision`.
 */

const NORTH_PBO_IDS = ['naftali', 'golan', 'baram', 'hiram', 'galma'];

/**
 * @param {{
 *   policy?: { usableForMetrics?: boolean, scopeConfidence?: string },
 *   classification?: { geoAreaTags?: string[], pboSubregionId?: string },
 *   usableForMetrics?: boolean,
 *   scopeConfidence?: string,
 *   geoAreaTags?: string[],
 *   pboSubregionId?: string,
 *   subregionId?: string,
 * }} g — resolved envelope (nested + flat fields)
 * @returns {{
 *   isNorthRelevant: boolean,
 *   source: 'geo' | 'geo_tags' | 'pbo_subregion' | 'unknown',
 *   confidence: 'high' | 'medium' | 'low',
 *   usableForMetrics: boolean,
 *   reasons: string[],
 * }}
 */
export function buildGeoScopeDecision(g) {
  const usable =
    g?.policy && typeof g.policy === 'object' && Object.prototype.hasOwnProperty.call(g.policy, 'usableForMetrics')
      ? g.policy.usableForMetrics
      : g.usableForMetrics;
  const usableBool = usable === true;
  const reasons = [];

  if (usable === false) {
    reasons.push('geo.usableForMetrics=false');
    return {
      isNorthRelevant: false,
      source: 'geo',
      confidence: 'low',
      usableForMetrics: false,
      reasons,
    };
  }

  const tags = g?.classification?.geoAreaTags ?? g.geoAreaTags;
  if (Array.isArray(tags) && tags.includes('north')) {
    reasons.push('geoAreaTags includes north');
    const rawConf = String(g?.policy?.scopeConfidence ?? g.scopeConfidence ?? 'medium')
      .trim()
      .toLowerCase();
    const confidence =
      rawConf === 'high' || rawConf === 'medium' || rawConf === 'low' ? rawConf : 'medium';
    return {
      isNorthRelevant: true,
      source: 'geo_tags',
      confidence,
      usableForMetrics: usableBool,
      reasons,
    };
  }

  const id = String(g?.classification?.pboSubregionId ?? g.pboSubregionId ?? g.subregionId ?? '')
    .trim()
    .toLowerCase();
  if (NORTH_PBO_IDS.includes(id)) {
    reasons.push(`pboSubregionId=${id}`);
    const rawConf = String(g?.policy?.scopeConfidence ?? g.scopeConfidence ?? 'medium')
      .trim()
      .toLowerCase();
    const confidence =
      rawConf === 'high' || rawConf === 'medium' || rawConf === 'low' ? rawConf : 'medium';
    return {
      isNorthRelevant: true,
      source: 'pbo_subregion',
      confidence,
      usableForMetrics: usableBool,
      reasons,
    };
  }

  reasons.push('no north geoAreaTag and no recognized PBO north subregion');
  return {
    isNorthRelevant: false,
    source: 'unknown',
    confidence: 'low',
    usableForMetrics: usableBool,
    reasons,
  };
}
