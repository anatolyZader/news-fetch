import assert from 'node:assert/strict';
import test from 'node:test';

import { validateGeoEnvelope } from '../../../../../business_modules/geo/domain/value_objects/geoEnrichmentSchema.js';

test('validateGeoEnvelope accepts resolved with quality fields', () => {
  const v = validateGeoEnvelope({
    kind: 'resolved',
    geoEntityType: 'locality',
    matchEvidence: {
      rawInput: 'X',
      normalizedInput: 'x',
      matchedVariant: 'X',
      candidateCount: 1,
    },
    scopeConfidence: 'high',
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
  });
  assert.equal(v.ok, true);
});

test('validateGeoEnvelope accepts resolved without legacy subregionId', () => {
  const v = validateGeoEnvelope({
    kind: 'resolved',
    geoEntityType: 'locality',
    matchEvidence: {
      rawInput: 'X',
      normalizedInput: 'x',
      matchedVariant: 'X',
      candidateCount: 1,
    },
    scopeConfidence: 'high',
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
  });
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
