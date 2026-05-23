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

const UNRESOLVED_FIELDS = {
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

/** @param {boolean} value */
function booleanToBit(value) {
  return value ? 1 : 0;
}

/** @param {{ geoJson: string, kind: string | null }} base */
function unresolvedGeoColumns(base) {
  return { ...base, ...UNRESOLVED_FIELDS };
}

/** @param {{ geoJson: string, kind: string | null }} base @param {object} g */
function resolvedGeoColumns(base, g) {
  return {
    ...base,
    canonicalKey: g.resolution?.canonicalKey ?? g.canonicalKey ?? null,
    entityType: geoEntityType(g),
    pboSubregionId: pboSubregionId(g),
    distanceBand: distanceBand(g),
    quality: quality(g),
    usable: booleanToBit(usableForMetrics(g)),
    review: booleanToBit(requiresReview(g)),
    scope: scopeConfidence(g),
    refVer: geoReferenceVersion(g),
    borderVer: borderReferenceVersion(g),
    policyVer: g.policy?.geoPolicyVersion ?? g.geoPolicyVersion ?? null,
  };
}

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
    return unresolvedGeoColumns(base);
  }

  return resolvedGeoColumns(base, g);
}
