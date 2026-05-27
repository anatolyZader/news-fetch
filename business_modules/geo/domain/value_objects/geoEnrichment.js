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
 * How the locality string was obtained before geoService resolve.
 * @typedef {'structured' | 'text_inferred' | 'message_level' | 'direct'} GeoProvenance
 */

/**
 * Nested resolution payload (canonical in v3 envelopes).
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
 *   provenance: GeoProvenance,
 *   scope?: 'signal' | 'message',
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
 * Resolved geo envelope (v3: nested groups canonical; flat root fields legacy read only).
 * @typedef {{
 *   kind: 'resolved',
 *   envelopeSchemaVersion: string,
 *   geoEntityType: GeoEntityType,
 *   resolution: GeoResolution,
 *   classification: GeoClassification,
 *   policy: GeoPolicy,
 *   audit: GeoAudit,
 *   matchEvidence: GeoMatchEvidence,
 *   scopeDecision: GeoScopeDecision,
 *   subregionId?: string,
 *   pboSubregionId?: string,
 *   geoReferenceVersion?: string,
 *   matchMethod?: string,
 *   quality?: 'high' | 'medium' | 'low',
 *   usableForMetrics?: boolean,
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
