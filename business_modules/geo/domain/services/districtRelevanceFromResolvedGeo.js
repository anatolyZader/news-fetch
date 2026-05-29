import { ISRAEL_REGIONAL_DISTRICT_ORDER } from '../../../../cross-cut-modules/geo/israelDistricts.js';
import { isNorthSubregionId } from '../value_objects/northSubregionId.js';

/**
 * @param {object | null | undefined} g
 * @returns {boolean | undefined}
 */
function readUsableForMetrics(g) {
  if (g?.policy && typeof g.policy === 'object' && Object.hasOwn(g.policy, 'usableForMetrics')) {
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
 * @param {string | undefined} rawConf
 * @param {boolean} usableBool
 * @returns {'high' | 'medium' | 'low'}
 */
function scopeConfidenceFromRaw(rawConf, usableBool) {
  const raw = String(rawConf ?? 'medium').trim().toLowerCase();
  let confidence = raw === 'high' || raw === 'medium' || raw === 'low' ? raw : 'medium';
  if (!usableBool) confidence = 'low';
  return confidence;
}

/**
 * @param {boolean} isRelevant
 * @param {'geo_tags' | 'pbo_subregion' | 'unknown'} source
 * @param {'high' | 'medium' | 'low'} confidence
 * @param {boolean} usableForMetrics
 * @param {string[]} reasons
 */
function districtRelevanceResult(isRelevant, source, confidence, usableForMetrics, reasons) {
  return { isRelevant, source, confidence, usableForMetrics, reasons };
}

/**
 * Home-front district ids implied by a resolved geo envelope.
 * @param {object | null | undefined} g
 * @returns {string[]}
 */
export function homeFrontDistrictIdsFromResolvedGeo(g) {
  if (g?.kind !== 'resolved') return [];
  const ids = new Set();
  const tags = readGeoAreaTags(g);
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      const t = String(tag ?? '').trim().toLowerCase();
      if (ISRAEL_REGIONAL_DISTRICT_ORDER.includes(t)) ids.add(t);
    }
  }
  const pboId = String(readPboSubregionId(g) ?? '').trim().toLowerCase();
  if (isNorthSubregionId(pboId)) ids.add('north');
  return [...ids];
}

/**
 * @param {string} scopeId — regional district id (north, south, …)
 * @param {object | null | undefined} g — resolved envelope
 * @returns {{
 *   isRelevant: boolean,
 *   source: 'geo_tags' | 'pbo_subregion' | 'unknown',
 *   confidence: 'high' | 'medium' | 'low',
 *   usableForMetrics: boolean,
 *   reasons: string[],
 * }}
 */
export function districtRelevanceFromResolvedGeo(scopeId, g) {
  const target = String(scopeId ?? '').trim().toLowerCase();
  const usable = readUsableForMetrics(g);
  const usableBool = usable === true;
  const reasons = [];
  if (usable === false) {
    reasons.push('geo.usableForMetrics=false');
  }

  const tags = readGeoAreaTags(g);
  if (Array.isArray(tags) && tags.includes(target)) {
    reasons.push(`geoAreaTags includes ${target}`);
    const confidence = scopeConfidenceFromRaw(readScopeConfidence(g), usableBool);
    return districtRelevanceResult(true, 'geo_tags', confidence, usableBool, reasons);
  }

  if (target === 'north') {
    const pboId = String(readPboSubregionId(g) ?? '').trim().toLowerCase();
    if (isNorthSubregionId(pboId)) {
      reasons.push(`pboSubregionId=${pboId}`);
      const confidence = scopeConfidenceFromRaw(readScopeConfidence(g), usableBool);
      return districtRelevanceResult(true, 'pbo_subregion', confidence, usableBool, reasons);
    }
  }

  reasons.push(`no geoAreaTag for ${target}`);
  return districtRelevanceResult(false, 'unknown', 'low', usableBool, reasons);
}
