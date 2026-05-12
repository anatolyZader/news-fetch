import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CENTROID_GEOMETRY_ONLY_ENTITY_TYPES,
  coalesceGeoEntityTypeHint,
  distanceSemanticsForGeoEntityType,
  resolveReferenceGeoEntityType,
} from '../../../../../business_modules/geo/domain/services/referenceGeoEntityType.js';

test('resolveReferenceGeoEntityType defaults to locality', () => {
  assert.equal(resolveReferenceGeoEntityType({}), 'locality');
  assert.equal(resolveReferenceGeoEntityType({ geoEntityType: 'bogus' }), 'locality');
});

test('resolveReferenceGeoEntityType accepts row allowlist', () => {
  assert.equal(resolveReferenceGeoEntityType({ geoEntityType: 'regional_council' }), 'regional_council');
  assert.equal(resolveReferenceGeoEntityType({ geoEntityType: 'MUNICIPALITY' }), 'municipality');
});

test('coalesceGeoEntityTypeHint prefers valid hint', () => {
  assert.equal(coalesceGeoEntityTypeHint('regional_council', 'locality'), 'regional_council');
  assert.equal(coalesceGeoEntityTypeHint('nope', 'locality'), 'locality');
});

test('distanceSemanticsForGeoEntityType', () => {
  assert.equal(distanceSemanticsForGeoEntityType('locality'), 'point_to_polyline');
  assert.equal(distanceSemanticsForGeoEntityType('regional_council'), 'representative_centroid_to_polyline');
  assert.equal(distanceSemanticsForGeoEntityType('municipality'), 'representative_centroid_to_polyline');
});

test('CENTROID_GEOMETRY_ONLY_ENTITY_TYPES includes regional_council', () => {
  assert.ok(CENTROID_GEOMETRY_ONLY_ENTITY_TYPES.has('regional_council'));
  assert.ok(!CENTROID_GEOMETRY_ONLY_ENTITY_TYPES.has('municipality'));
});
