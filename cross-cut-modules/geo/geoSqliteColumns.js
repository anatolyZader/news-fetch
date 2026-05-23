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

const EMPTY_COLUMNS = {
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

/**
 * Denormalized SQLite columns for a signal geo envelope (WhatsApp store and future DBs).
 * @param {object | null | undefined} g
 */
export function denormalizedGeoColumns(g) {
  if (!g || typeof g !== 'object') {
    return { ...EMPTY_COLUMNS };
  }

  const base = {
    geoJson: JSON.stringify(g),
    kind: g.kind ?? null,
  };

  if (g.kind !== 'resolved') {
    return {
      ...base,
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

  return {
    ...base,
    canonicalKey: g.resolution?.canonicalKey ?? g.canonicalKey ?? null,
    entityType: geoEntityType(g),
    pboSubregionId: pboSubregionId(g),
    distanceBand: distanceBand(g),
    quality: quality(g),
    usable: usableForMetrics(g) ? 1 : 0,
    review: requiresReview(g) ? 1 : 0,
    scope: scopeConfidence(g),
    refVer: geoReferenceVersion(g),
    borderVer: borderReferenceVersion(g),
    policyVer: g.policy?.geoPolicyVersion ?? g.geoPolicyVersion ?? null,
  };
}
