import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveGeoQualityFields,
  deriveScopeConfidence,
  FUZZY_METRICS_MIN_CONFIDENCE,
} from '../../../../../business_modules/geo/domain/services/geoQualityPolicy.js';

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

test('deriveGeoQualityFields: fuzzy below threshold is low', () => {
  const r = deriveGeoQualityFields({ matchMethod: 'fuzzy', matchConfidence: 0.87 });
  assert.equal(r.quality, 'low');
  assert.equal(r.usableForMetrics, false);
  assert.equal(r.requiresReview, true);
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
