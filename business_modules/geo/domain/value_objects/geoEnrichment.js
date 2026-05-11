/**
 * @typedef {{ lat: number, lon: number }} LatLon
 */

/**
 * @typedef {{
 *   canonicalKey: string,
 *   names: string[],
 *   lat: number,
 *   lon: number,
 *   subregionId: string,
 *   officialHebrewName?: string,
 *   municipalityType?: string,
 *   parentCouncilKey?: string | null,
 * }} NorthLocalityRow
 */

/**
 * What the free-text input referred to before full regional-council / area modeling exists.
 * @typedef {'locality' | 'municipality' | 'regional_council' | 'area' | 'subregion' | 'unknown'} GeoEntityType
 */

/**
 * Deterministic audit trail for how raw locality text was matched (especially fuzzy / admin review).
 * @typedef {{
 *   rawInput: string,
 *   normalizedInput: string,
 *   matchedVariant: string,
 *   candidateCount: number,
 * }} GeoMatchEvidence
 */

/**
 * Resolved geo envelope. Field **`subregionId`** is deprecated: it duplicates **`pboSubregionId`** for backward compatibility; new code must use **`pboSubregionId`** and **`geoAreaTags`** only. When **`GEO_LEGACY_SUBREGION_ID`** is disabled, **`subregionId`** is omitted from emitted JSON.
 * @typedef {{
 *   kind: 'resolved',
 *   geoEntityType: GeoEntityType,
 *   matchEvidence: GeoMatchEvidence,
 *   scopeConfidence: 'high' | 'medium' | 'low',
 *   geoReferenceVersion: string,
 *   borderReferenceVersion: string | null,
 *   source: string,
 *   canonicalKey: string,
 *   matchedName: string,
 *   pboSubregionId: string,
 *   subregionId?: string,
 *   geoAreaTags: string[],
 *   distanceKmToNorthBorder: number,
 *   distanceBand: string,
 *   isGolan: boolean,
 *   matchMethod: 'exact' | 'punctuation' | 'hebrew_final' | 'alias' | 'fuzzy',
 *   matchConfidence: number,
 *   quality: 'high' | 'medium' | 'low',
 *   usableForMetrics: boolean,
 *   requiresReview: boolean,
 * }} GeoResolved
 */

/**
 * @typedef {{
 *   kind: 'unknown',
 *   reason: string,
 *   rawName: string | null,
 *   geoReferenceVersion: string | null,
 *   source?: string,
 *   candidates?: { canonicalKey: string, score: number }[],
 * }} GeoUnknown
 */

/**
 * @param {GeoResolved | GeoUnknown} r
 * @returns {r is GeoResolved}
 */
export function isGeoResolved(r) {
  return r != null && typeof r === 'object' && r.kind === 'resolved';
}
