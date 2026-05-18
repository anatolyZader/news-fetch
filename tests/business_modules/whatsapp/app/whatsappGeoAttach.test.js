import assert from 'node:assert/strict';
import test from 'node:test';

import { attachGeoToSignalsAndStructured } from '../../../../cross-cut-modules/geo/attachGeoToSignals.js';

test('attachGeoToSignalsAndStructured resolves per-signal locality before message fallback', () => {
  const calls = [];
  const port = {
    resolveLocalityName(raw, opts) {
      calls.push({ raw, opts });
      return {
        kind: 'resolved',
        envelopeSchemaVersion: 'geo-envelope-2026-05-v1',
        geoEntityType: 'locality',
        scopeConfidence: 'high',
        geoPolicyVersion: 'geo-policy-2026-05-v2',
        geoReferenceVersion: 'v1',
        source: 'test',
        canonicalKey: 'x',
        matchedName: raw,
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
  assert.equal(out[0].geo?.resolution?.scope ?? out[0].geo?.resolution?.scope, 'signal');
});
