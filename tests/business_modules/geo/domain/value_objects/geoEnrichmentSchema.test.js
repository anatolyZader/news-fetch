import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGeoScopeDecision } from '../../../../../business_modules/geo/domain/services/geoScopeDecisionFromResolved.js';
import { validateGeoEnvelope } from '../../../../../business_modules/geo/domain/value_objects/geoEnrichmentSchema.js';

function withScopeDecision(resolvedLike) {
  const o = { ...resolvedLike };
  o.scopeDecision = buildGeoScopeDecision(o);
  return o;
}

test('validateGeoEnvelope accepts resolved with quality fields', () => {
  const v = validateGeoEnvelope(
    withScopeDecision({
    kind: 'resolved',
    geoEntityType: 'locality',
    matchEvidence: {
      rawInput: 'X',
      normalizedInput: 'x',
      matchedVariant: 'X',
      candidateCount: 1,
    },
    scopeConfidence: 'high',
    geoPolicyVersion: 'geo-policy-2026-05-v2',
    geoReferenceVersion: 'v1',
    borderReferenceVersion: null,
    source: 's',
    canonicalKey: 'x',
    matchedName: 'X',
    pboSubregionId: 'naftali',
    subregionId: 'naftali',
    geoAreaTags: ['north'],
    distanceKmToNorthBorder: 1,
    distanceBand: '0-10',
    isGolan: false,
    matchMethod: 'exact',
    matchConfidence: 1,
    quality: 'high',
    usableForMetrics: true,
    requiresReview: false,
    }),
  );
  assert.equal(v.ok, true);
});

test('validateGeoEnvelope accepts resolved without legacy subregionId', () => {
  const v = validateGeoEnvelope(
    withScopeDecision({
    kind: 'resolved',
    geoEntityType: 'locality',
    matchEvidence: {
      rawInput: 'X',
      normalizedInput: 'x',
      matchedVariant: 'X',
      candidateCount: 1,
    },
    scopeConfidence: 'high',
    geoPolicyVersion: 'geo-policy-2026-05-v2',
    geoReferenceVersion: 'v1',
    borderReferenceVersion: null,
    source: 's',
    canonicalKey: 'x',
    matchedName: 'X',
    pboSubregionId: 'naftali',
    geoAreaTags: ['north'],
    distanceKmToNorthBorder: 1,
    distanceBand: '0-10',
    isGolan: false,
    matchMethod: 'exact',
    matchConfidence: 1,
    quality: 'high',
    usableForMetrics: true,
    requiresReview: false,
    }),
  );
  assert.equal(v.ok, true);
});

test('validateGeoEnvelope rejects resolved missing quality', () => {
  const v = validateGeoEnvelope({
    kind: 'resolved',
    geoReferenceVersion: 'v1',
    canonicalKey: 'x',
    matchedName: 'X',
    pboSubregionId: 'naftali',
    geoAreaTags: [],
    matchMethod: 'exact',
    matchConfidence: 1,
  });
  assert.equal(v.ok, false);
});

test('validateGeoEnvelope rejects invalid classification.distanceSemantics', () => {
  const v = validateGeoEnvelope(
    withScopeDecision({
    kind: 'resolved',
    geoEntityType: 'locality',
    matchEvidence: {
      rawInput: 'X',
      normalizedInput: 'x',
      matchedVariant: 'X',
      candidateCount: 1,
    },
    scopeConfidence: 'high',
    geoPolicyVersion: 'geo-policy-2026-05-v2',
    geoReferenceVersion: 'v1',
    borderReferenceVersion: null,
    source: 's',
    canonicalKey: 'x',
    matchedName: 'X',
    pboSubregionId: 'naftali',
    geoAreaTags: ['north'],
    distanceKmToNorthBorder: 1,
    distanceBand: '0-10',
    isGolan: false,
    matchMethod: 'exact',
    matchConfidence: 1,
    quality: 'high',
    usableForMetrics: true,
    requiresReview: false,
    classification: {
      pboSubregionId: 'naftali',
      geoAreaTags: [],
      isGolan: false,
      distanceKmToNorthBorder: 1,
      distanceBand: '0-10',
      distanceSemantics: 'bogus',
    },
    }),
  );
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('distanceSemantics')));
});

test('validateGeoEnvelope accepts nested classification with distanceSemantics', () => {
  const envelope = {
    kind: 'resolved',
    geoEntityType: 'regional_council',
    resolution: {
      rawInput: 'גולן',
      normalizedInput: 'גולן',
      canonicalKey: 'g',
      matchedName: 'גולן',
      matchedVariant: 'גולן',
      matchMethod: 'exact',
      matchConfidence: 1,
      candidateCount: 1,
      geoEntityType: 'regional_council',
    },
    classification: {
      pboSubregionId: 'golan',
      geoAreaTags: ['golan_heights'],
      isGolan: true,
      distanceKmToNorthBorder: 2,
      distanceBand: '0-10',
      distanceSemantics: 'representative_centroid_to_polyline',
    },
    policy: {
      geoPolicyVersion: 'geo-policy-2026-05-v2',
      quality: 'medium',
      usableForMetrics: false,
      requiresReview: true,
      scopeConfidence: 'low',
    },
    audit: {
      geoReferenceVersion: 'v1',
      borderReferenceVersion: 'b1',
      source: 's',
      resolvedAt: '2026-01-01T00:00:00.000Z',
    },
    matchEvidence: {
      rawInput: 'גולן',
      normalizedInput: 'גולן',
      matchedVariant: 'גולן',
      candidateCount: 1,
    },
    scopeConfidence: 'low',
    geoPolicyVersion: 'geo-policy-2026-05-v2',
    geoReferenceVersion: 'v1',
    borderReferenceVersion: 'b1',
    source: 's',
    canonicalKey: 'g',
    matchedName: 'גולן',
    pboSubregionId: 'golan',
    geoAreaTags: ['golan_heights'],
    distanceKmToNorthBorder: 2,
    distanceBand: '0-10',
    isGolan: true,
    matchMethod: 'exact',
    matchConfidence: 1,
    quality: 'medium',
    usableForMetrics: false,
    requiresReview: true,
  };
  envelope.scopeDecision = buildGeoScopeDecision(envelope);
  const v = validateGeoEnvelope(envelope);
  assert.equal(v.ok, true);
});

test('validateGeoEnvelope accepts unknown', () => {
  const v = validateGeoEnvelope({
    kind: 'unknown',
    reason: 'NO_MATCH',
    rawName: 'foo',
    geoReferenceVersion: 'v1',
    source: 's',
  });
  assert.equal(v.ok, true);
});
