import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGeoScopeDecision } from '../../../../../business_modules/geo/domain/services/geoScopeDecisionFromResolved.js';

test('buildGeoScopeDecision: metrics ineligible → not north-relevant from geo', () => {
  const d = buildGeoScopeDecision({
    policy: { usableForMetrics: false, scopeConfidence: 'low' },
    classification: { pboSubregionId: 'golan', geoAreaTags: ['north', 'golan_heights'] },
  });
  assert.equal(d.isNorthRelevant, false);
  assert.equal(d.source, 'geo');
  assert.ok(d.reasons.includes('geo.usableForMetrics=false'));
});

test('buildGeoScopeDecision: north tag + metrics-safe', () => {
  const d = buildGeoScopeDecision({
    policy: { usableForMetrics: true, scopeConfidence: 'high' },
    classification: { pboSubregionId: 'naftali', geoAreaTags: ['north', 'upper_galilee_adjacent'] },
  });
  assert.equal(d.isNorthRelevant, true);
  assert.equal(d.source, 'geo_tags');
  assert.equal(d.confidence, 'high');
});

test('buildGeoScopeDecision: PBO id without north tag still counts (edge)', () => {
  const d = buildGeoScopeDecision({
    policy: { usableForMetrics: true, scopeConfidence: 'medium' },
    classification: { pboSubregionId: 'hiram', geoAreaTags: [] },
    pboSubregionId: 'hiram',
    geoAreaTags: [],
  });
  assert.equal(d.isNorthRelevant, true);
  assert.equal(d.source, 'pbo_subregion');
});
