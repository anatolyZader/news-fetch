/**
 * Nested-first accessors for geo envelopes (prefer classification/policy over flat duplicates).
 * Legacy flat fallbacks retained here only for reading old persisted blobs.
 */

/** @param {object | null | undefined} g */
export function pboSubregionId(g) {
  return g?.classification?.pboSubregionId ?? g?.pboSubregionId ?? g?.subregionId ?? null;
}

/** @param {object | null | undefined} g */
export function geoAreaTags(g) {
  return g?.classification?.geoAreaTags ?? g?.geoAreaTags ?? [];
}

/** @param {object | null | undefined} g */
export function usableForMetrics(g) {
  if (g?.policy && typeof g.policy === 'object' && Object.prototype.hasOwnProperty.call(g.policy, 'usableForMetrics')) {
    return g.policy.usableForMetrics;
  }
  return g?.usableForMetrics;
}

/** @param {object | null | undefined} g */
export function requiresReview(g) {
  if (g?.policy && typeof g.policy === 'object' && Object.prototype.hasOwnProperty.call(g.policy, 'requiresReview')) {
    return g.policy.requiresReview;
  }
  return g?.requiresReview;
}

/** @param {object | null | undefined} g */
export function distanceBand(g) {
  return g?.classification?.distanceBand ?? g?.distanceBand ?? null;
}

/** @param {object | null | undefined} g */
export function distanceKmToNorthBorder(g) {
  return g?.classification?.distanceKmToNorthBorder ?? g?.distanceKmToNorthBorder ?? null;
}

/** @param {object | null | undefined} g */
export function isGolan(g) {
  if (g?.classification && typeof g.classification.isGolan === 'boolean') return g.classification.isGolan;
  return g?.isGolan ?? null;
}

/** @param {object | null | undefined} g */
export function geoEntityType(g) {
  return g?.resolution?.geoEntityType ?? g?.geoEntityType ?? null;
}

/** @param {object | null | undefined} g */
export function matchMethod(g) {
  return g?.resolution?.matchMethod ?? g?.matchMethod ?? null;
}

/** @param {object | null | undefined} g */
export function matchConfidence(g) {
  return g?.resolution?.matchConfidence ?? g?.matchConfidence ?? null;
}

/** @param {object | null | undefined} g */
export function provenance(g) {
  return g?.resolution?.provenance ?? null;
}

/** @param {object | null | undefined} g */
export function resolutionScope(g) {
  return g?.resolution?.scope ?? null;
}

/** @param {object | null | undefined} g */
export function canonicalKey(g) {
  return g?.resolution?.canonicalKey ?? g?.canonicalKey ?? null;
}

/** @param {object | null | undefined} g */
export function matchedName(g) {
  return g?.resolution?.matchedName ?? g?.matchedName ?? g?.matchEvidence?.matchedVariant ?? null;
}

/** @param {object | null | undefined} g */
export function scopeConfidence(g) {
  return g?.policy?.scopeConfidence ?? g?.scopeConfidence ?? null;
}

/** @param {object | null | undefined} g */
export function quality(g) {
  return g?.policy?.quality ?? g?.quality ?? null;
}

/** @param {object | null | undefined} g */
export function geoPolicyVersion(g) {
  return g?.policy?.geoPolicyVersion ?? g?.geoPolicyVersion ?? null;
}

/** @param {object | null | undefined} g */
export function geoReferenceVersion(g) {
  return g?.audit?.geoReferenceVersion ?? g?.geoReferenceVersion ?? null;
}

/** @param {object | null | undefined} g */
export function borderReferenceVersion(g) {
  return g?.audit?.borderReferenceVersion ?? g?.borderReferenceVersion ?? null;
}

/** @param {object | null | undefined} g */
export function geoSource(g) {
  return g?.audit?.source ?? g?.source ?? null;
}

/** @param {object | null | undefined} g */
export function distanceSemantics(g) {
  return g?.classification?.distanceSemantics ?? null;
}
