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
 *   geoEntityType?: string,
 * }} NorthLocalityRow
 */

/**
 * What the free-text input referred to before full regional-council / area modeling exists.
 * @typedef {'locality' | 'municipality' | 'regional_council' | 'pbo_subregion' | 'district' | 'area' | 'subregion' | 'border_zone' | 'facility' | 'unknown'} GeoEntityType
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
 * Nested resolution payload (new contract direction; dual-written alongside flat fields).
 * @typedef {{
 *   rawInput: string,
 *   normalizedInput: string,
 *   canonicalKey: string,
 *   matchedName: string,
 *   matchedVariant: string,
 *   matchMethod: 'exact' | 'punctuation' | 'hebrew_final' | 'alias' | 'manual_override' | 'fuzzy',
 *   matchConfidence: number,
 *   candidateCount: number,
 *   geoEntityType: GeoEntityType,
 * }} GeoResolution
 */

/**
 * Nested classification payload (new contract direction; dual-written alongside flat fields).
 * @typedef {{
 *   pboSubregionId: string,
 *   geoAreaTags: string[],
 *   isGolan: boolean,
 *   distanceKmToNorthBorder: number,
 *   distanceBand: string,
 *   distanceSemantics?: 'point_to_polyline' | 'representative_centroid_to_polyline',
 * }} GeoClassification
 */

/**
 * Nested policy payload (new contract direction; dual-written alongside flat fields).
 * @typedef {{
 *   geoPolicyVersion: string,
 *   quality: 'high' | 'medium' | 'low',
 *   usableForMetrics: boolean,
 *   requiresReview: boolean,
 *   scopeConfidence: 'high' | 'medium' | 'low',
 *   decisionReasons?: string[],
 * }} GeoPolicy
 */

/**
 * Nested audit payload (new contract direction; dual-written alongside flat fields).
 * @typedef {{
 *   geoReferenceVersion: string,
 *   borderReferenceVersion: string | null,
 *   source: string,
 *   resolvedAt: string,
 * }} GeoAudit
 */

/**
 * Explainability: north relevance implied by this resolved geo alone (no signal keyword / source_type).
 * @typedef {{
 *   isNorthRelevant: boolean,
 *   source: 'geo' | 'geo_tags' | 'pbo_subregion' | 'unknown',
 *   confidence: 'high' | 'medium' | 'low',
 *   usableForMetrics: boolean,
 *   reasons: string[],
 * }} GeoScopeDecision
 */

/**
 * Resolved geo envelope. Field **`subregionId`** is deprecated: it duplicates **`pboSubregionId`** for backward compatibility; new code must use **`pboSubregionId`** and **`geoAreaTags`** only. When **`GEO_LEGACY_SUBREGION_ID`** is disabled, **`subregionId`** is omitted from emitted JSON.
 * @typedef {{
 *   kind: 'resolved',
 *   resolution: GeoResolution,
 *   classification: GeoClassification,
 *   policy: GeoPolicy,
 *   audit: GeoAudit,
 *   scopeDecision: GeoScopeDecision,
 *   geoEntityType: GeoEntityType,
 *   matchEvidence: GeoMatchEvidence,
 *   scopeConfidence: 'high' | 'medium' | 'low',
 *   geoPolicyVersion: string,
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
 *   matchMethod: 'exact' | 'punctuation' | 'hebrew_final' | 'alias' | 'manual_override' | 'fuzzy',
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
 *   resolution?: { rawInput: string | null, normalizedInput?: string | null, geoEntityType?: GeoEntityType },
 *   audit?: { geoReferenceVersion: string | null, source?: string | null, resolvedAt: string },
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
