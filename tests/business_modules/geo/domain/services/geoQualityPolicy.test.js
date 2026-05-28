import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveGeoQualityFields,
  deriveScopeConfidence,
  GEO_POLICY_VERSION,
  FUZZY_METRICS_MIN_CONFIDENCE,
} from '../../../../../business_modules/geo/domain/services/geoQualityPolicy.js';
import { GEO_PROVENANCE } from '../../../../../business_modules/geo/domain/value_objects/geoProvenance.js';

test('deriveGeoQualityFields: deterministic match is high and metrics-safe', () => {
  const r = deriveGeoQualityFields({ matchMethod: 'exact', matchConfidence: 1 });
  assert.equal(r.quality, 'high');
  assert.equal(r.usableForMetrics, true);
  assert.equal(r.requiresReview, false);
});

test('deriveGeoQualityFields: fuzzy at threshold is medium and metrics-safe', () => {
  const r = deriveGeoQualityFields({ matchMethod: 'fuzzy', matchConfidence: FUZZY_METRICS_MIN_CONFIDENCE });
  assert.equal(r.quality, 'medium');
  assert.equal(r.usableForMetrics, true);
  assert.equal(r.requiresReview, true);
});

test('deriveGeoQualityFields: regional_council caps quality and disables metrics', () => {
  const r = deriveGeoQualityFields({ matchMethod: 'exact', matchConfidence: 1, geoEntityType: 'regional_council' });
  assert.equal(r.quality, 'medium');
  assert.equal(r.usableForMetrics, false);
  assert.equal(r.requiresReview, true);
});

test('deriveGeoQualityFields: text_inferred news disables metrics', () => {
  const r = deriveGeoQualityFields({
    matchMethod: 'exact',
    matchConfidence: 1,
    provenance: GEO_PROVENANCE.text_inferred,
    sourceType: 'news',
  });
  assert.equal(r.quality, 'medium');
  assert.equal(r.usableForMetrics, false);
  assert.equal(r.requiresReview, true);
  assert.ok(r.policyReasons.includes('text_inferred_source'));
});

test('deriveScopeConfidence: metrics-safe without review is high', () => {
  assert.equal(deriveScopeConfidence({ usableForMetrics: true, requiresReview: false }), 'high');
});

test('deriveScopeConfidence: fuzzy metrics-safe with review is medium', () => {
  assert.equal(deriveScopeConfidence({ usableForMetrics: true, requiresReview: true }), 'medium');
});

test('deriveScopeConfidence: not metrics-safe is low', () => {
  assert.equal(deriveScopeConfidence({ usableForMetrics: false, requiresReview: true }), 'low');
});

test('GEO_POLICY_VERSION is v3', () => {
  assert.equal(GEO_POLICY_VERSION, 'geo-policy-2026-05-v3');
});
