import { isNorthSubregionId } from '../value_objects/northSubregionId.js';

/**
 * @param {object | null | undefined} g — resolved envelope (nested canonical; legacy flat tolerated)
 * @returns {boolean | undefined}
 */
function readUsableForMetrics(g) {
  if (g?.policy && typeof g.policy === 'object' && Object.prototype.hasOwnProperty.call(g.policy, 'usableForMetrics')) {
    return g.policy.usableForMetrics;
  }
  return g?.usableForMetrics;
}

/**
 * @param {object | null | undefined} g
 * @returns {string | undefined}
 */
function readScopeConfidence(g) {
  return g?.policy?.scopeConfidence ?? g?.scopeConfidence;
}

/**
 * @param {object | null | undefined} g
 * @returns {string | null}
 */
function readPboSubregionId(g) {
  return g?.classification?.pboSubregionId ?? g?.pboSubregionId ?? g?.subregionId ?? null;
}

/**
 * @param {object | null | undefined} g
 * @returns {string[] | undefined}
 */
function readGeoAreaTags(g) {
  return g?.classification?.geoAreaTags ?? g?.geoAreaTags;
}

/**
 * @param {object | null | undefined} g — resolved envelope
 * @returns {{
 *   isNorthRelevant: boolean,
 *   source: 'geo' | 'geo_tags' | 'pbo_subregion' | 'unknown',
 *   confidence: 'high' | 'medium' | 'low',
 *   usableForMetrics: boolean,
 *   reasons: string[],
 * }}
 */
export function northRelevanceFromResolvedGeo(g) {
  const usable = readUsableForMetrics(g);
  const usableBool = usable === true;
  const reasons = [];
  if (usable === false) {
    reasons.push('geo.usableForMetrics=false');
  }

  const tags = readGeoAreaTags(g);
  if (Array.isArray(tags) && tags.includes('north')) {
    reasons.push('geoAreaTags includes north');
    const rawConf = String(readScopeConfidence(g) ?? 'medium').trim().toLowerCase();
    let confidence =
      rawConf === 'high' || rawConf === 'medium' || rawConf === 'low' ? rawConf : 'medium';
    if (!usableBool) confidence = 'low';
    return {
      isNorthRelevant: true,
      source: 'geo_tags',
      confidence,
      usableForMetrics: usableBool,
      reasons,
    };
  }

  const id = String(readPboSubregionId(g) ?? '').trim().toLowerCase();
  if (isNorthSubregionId(id)) {
    reasons.push(`pboSubregionId=${id}`);
    const rawConf = String(readScopeConfidence(g) ?? 'medium').trim().toLowerCase();
    let confidence =
      rawConf === 'high' || rawConf === 'medium' || rawConf === 'low' ? rawConf : 'medium';
    if (!usableBool) confidence = 'low';
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
