import assert from 'node:assert/strict';
import test from 'node:test';

import { attachGeoToSignals } from '../../../cross-cut-modules/geo/attachGeoToSignals.js';
import { GEO_PROVENANCE } from '../../../business_modules/geo/domain/value_objects/geoProvenance.js';
import { GEO_ENVELOPE_SCHEMA_VERSION } from '../../../business_modules/geo/domain/value_objects/geoEnvelopeVersion.js';

function mockPort() {
  return {
    resolveLocalityName(raw, opts) {
      return {
        kind: 'resolved',
        envelopeSchemaVersion: GEO_ENVELOPE_SCHEMA_VERSION,
        geoEntityType: 'locality',
        resolution: {
          rawInput: String(raw),
          normalizedInput: String(raw).toLowerCase(),
          canonicalKey: 'x',
          matchedName: String(raw),
          matchedVariant: String(raw),
          matchMethod: 'exact',
          matchConfidence: 1,
          candidateCount: 1,
          geoEntityType: 'locality',
          provenance: opts?.provenance ?? GEO_PROVENANCE.direct,
          scope: opts?.resolutionScope,
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
          geoPolicyVersion: 'geo-policy-2026-05-v3',
          quality: opts?.provenance === GEO_PROVENANCE.text_inferred ? 'medium' : 'high',
          usableForMetrics: opts?.provenance !== GEO_PROVENANCE.text_inferred,
          requiresReview: opts?.provenance === GEO_PROVENANCE.text_inferred,
          scopeConfidence: opts?.provenance === GEO_PROVENANCE.text_inferred ? 'low' : 'high',
          decisionReasons: [],
        },
        audit: {
          geoReferenceVersion: 'v1',
          borderReferenceVersion: null,
          source: 'test',
          resolvedAt: '2026-01-01T00:00:00.000Z',
        },
        matchEvidence: {
          rawInput: String(raw),
          normalizedInput: String(raw).toLowerCase(),
          matchedVariant: String(raw),
          candidateCount: 1,
        },
        scopeDecision: {
          isNorthRelevant: true,
          source: 'geo_tags',
          confidence: opts?.provenance === GEO_PROVENANCE.text_inferred ? 'low' : 'high',
          usableForMetrics: opts?.provenance !== GEO_PROVENANCE.text_inferred,
          reasons: ['geoAreaTags includes north'],
        },
      };
    },
  };
}

test('attachGeoToSignals skips geo when no locality candidate', () => {
  const port = mockPort();
  const { signals, attached } = attachGeoToSignals(
    [{ source_type: 'news', evidence: 'General national policy debate.' }],
    port,
    { sourceType: 'news' },
  );
  assert.equal(attached, 0);
  assert.equal(signals[0].geo, undefined);
});

test('attachGeoToSignals passes provenance and sourceType to resolve', () => {
  const calls = [];
  const port = {
    resolveLocalityName(raw, opts) {
      calls.push({ raw, opts });
      return mockPort().resolveLocalityName(raw, opts);
    },
  };
  attachGeoToSignals(
    [{ source_type: 'news', evidence: 'Residents in Kiryat Shmona entered shelters.', municipality: 'Kiryat Shmona' }],
    port,
    { sourceType: 'news' },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.provenance, GEO_PROVENANCE.structured);
  assert.equal(calls[0].opts.sourceType, 'news');
});
