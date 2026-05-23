import {
  borderReferenceVersion,
  geoEntityType,
  geoReferenceVersion,
  pboSubregionId,
  quality,
  requiresReview,
  scopeConfidence,
  usableForMetrics,
  distanceBand,
} from './geoEnvelopeAccess.js';

/**
 * Denormalized SQLite columns for a signal geo envelope (WhatsApp store and future DBs).
 * @param {object | null | undefined} g
 */
export function denormalizedGeoColumns(g) {
  if (!g || typeof g !== 'object') {
    return {
      geoJson: null,
      kind: null,
      canonicalKey: null,
      entityType: null,
      pboSubregionId: null,
      distanceBand: null,
      quality: null,
      usable: null,
      review: null,
      scope: null,
      refVer: null,
      borderVer: null,
      policyVer: null,
    };
  }
  const resolved = g.kind === 'resolved';
  return {
    geoJson: JSON.stringify(g),
    kind: g.kind ?? null,
    canonicalKey: resolved ? (g.resolution?.canonicalKey ?? g.canonicalKey ?? null) : null,
    entityType: resolved ? geoEntityType(g) : null,
    pboSubregionId: resolved ? pboSubregionId(g) : null,
    distanceBand: resolved ? distanceBand(g) : null,
    quality: resolved ? quality(g) : null,
    usable: resolved ? (usableForMetrics(g) ? 1 : 0) : null,
    review: resolved ? (requiresReview(g) ? 1 : 0) : null,
    scope: resolved ? scopeConfidence(g) : null,
    refVer: resolved ? geoReferenceVersion(g) : null,
    borderVer: resolved ? borderReferenceVersion(g) : null,
    policyVer: resolved ? (g.policy?.geoPolicyVersion ?? g.geoPolicyVersion ?? null) : null,
  };
}
