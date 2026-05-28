import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGeoScopeDecision } from '../../../../../business_modules/geo/domain/services/geoScopeDecisionFromResolved.js';
import { validateGeoEnvelope } from '../../../../../business_modules/geo/domain/value_objects/geoEnrichmentSchema.js';
import { GEO_ENVELOPE_SCHEMA_VERSION } from '../../../../../business_modules/geo/domain/value_objects/geoEnvelopeVersion.js';
import { GEO_PROVENANCE } from '../../../../../business_modules/geo/domain/value_objects/geoProvenance.js';
import { GEO_POLICY_VERSION } from '../../../../../business_modules/geo/domain/services/geoQualityPolicy.js';

function makeV3Resolved(overrides = {}) {
  const base = {
    kind: 'resolved',
    envelopeSchemaVersion: GEO_ENVELOPE_SCHEMA_VERSION,
    geoEntityType: 'locality',
    resolution: {
      rawInput: 'X',
      normalizedInput: 'x',
      canonicalKey: 'x',
      matchedName: 'X',
      matchedVariant: 'X',
      matchMethod: 'exact',
      matchConfidence: 1,
      candidateCount: 1,
      geoEntityType: 'locality',
      provenance: GEO_PROVENANCE.direct,
    },
    classification: {
      pboSubregionId: 'naftali',
      geoAreaTags: ['north'],
      isGolan: false,
      distanceKmToNorthBorder: 1,
      distanceBand: '0-10',
      distanceSemantics: 'point_to_polyline',
    },
    policy: {
      geoPolicyVersion: GEO_POLICY_VERSION,
      quality: 'high',
      usableForMetrics: true,
      requiresReview: false,
      scopeConfidence: 'high',
      decisionReasons: ['deterministic_match'],
    },
    audit: {
      geoReferenceVersion: 'v1',
      borderReferenceVersion: null,
      source: 's',
      resolvedAt: '2026-01-01T00:00:00.000Z',
    },
    matchEvidence: {
      rawInput: 'X',
      normalizedInput: 'x',
      matchedVariant: 'X',
      candidateCount: 1,
    },
  };
  return { ...base, ...overrides, resolution: { ...base.resolution, ...overrides.resolution } };
}

function withScopeDecision(resolvedLike) {
  const o = { ...resolvedLike };
  o.scopeDecision = buildGeoScopeDecision(o);
  return o;
}

test('validateGeoEnvelope accepts nested v3 resolved envelope', () => {
  const v = validateGeoEnvelope(withScopeDecision(makeV3Resolved()));
  assert.equal(v.ok, true);
});

test('validateGeoEnvelope rejects v3 resolved missing provenance', () => {
  const env = makeV3Resolved();
  delete env.resolution.provenance;
  const v = validateGeoEnvelope(withScopeDecision(env));
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('provenance')));
});

test('validateGeoEnvelope rejects resolved missing nested policy', () => {
  const env = makeV3Resolved();
  delete env.policy;
  const v = validateGeoEnvelope(withScopeDecision(env));
  assert.equal(v.ok, false);
});

test('validateGeoEnvelope rejects invalid classification.distanceSemantics', () => {
  const env = makeV3Resolved({
    classification: {
      pboSubregionId: 'naftali',
      geoAreaTags: [],
      isGolan: false,
      distanceKmToNorthBorder: 1,
      distanceBand: '0-10',
      distanceSemantics: 'bogus',
    },
  });
  const v = validateGeoEnvelope(withScopeDecision(env));
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('distanceSemantics')));
});

test('validateGeoEnvelope accepts nested classification with distanceSemantics', () => {
  const envelope = withScopeDecision(
    makeV3Resolved({
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
        provenance: GEO_PROVENANCE.direct,
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
        geoPolicyVersion: GEO_POLICY_VERSION,
        quality: 'medium',
        usableForMetrics: false,
        requiresReview: true,
        scopeConfidence: 'low',
        decisionReasons: ['centroid_geometry_only'],
      },
    }),
  );
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
