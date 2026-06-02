import assert from 'node:assert/strict';
import test from 'node:test';

import { attachGeoToSignalsAndStructured } from '../../../../cross-cut-modules/geo/attachGeoToSignals.js';
import { GEO_PROVENANCE } from '../../../../business_modules/geo/domain/value_objects/geoProvenance.js';
import { GEO_ENVELOPE_SCHEMA_VERSION } from '../../../../business_modules/geo/domain/value_objects/geoEnvelopeVersion.js';

function resolvedGeoEnvelope(raw, opts = {}) {
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
      provenance: opts.provenance ?? GEO_PROVENANCE.direct,
      scope: opts.resolutionScope,
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
      quality: 'high',
      usableForMetrics: true,
      requiresReview: false,
      scopeConfidence: 'high',
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
      confidence: 'high',
      usableForMetrics: true,
      reasons: ['geoAreaTags includes north'],
    },
  };
}

test('attachGeoToSignalsAndStructured resolves per-signal locality before message fallback', () => {
  const calls = [];
  const port = {
    resolveLocalityName(raw, opts) {
      calls.push({ raw, opts });
      return resolvedGeoEnvelope(raw, opts);
    },
  };

  const structured = { observation: { locality: 'MessageLevel' } };
  const signals = [
    { locality: 'קריית שמונה', evidence: 'לחץ ביומיום', signal_type: 'fear_expression' },
    { evidence: 'no place here', signal_type: 'calm_confidence' },
  ];

  const { signals: out } = attachGeoToSignalsAndStructured(signals, structured, port, {
    sourceType: 'whatsapp',
  });

  assert.equal(out.length, 2);
  assert.ok(calls.some((c) => c.raw && c.raw !== 'MessageLevel'));
  assert.ok(calls.some((c) => c.raw === 'MessageLevel' || c.opts?.sourceType === 'whatsapp'));
  assert.equal(out[0].geo?.resolution?.scope, 'signal');
});
