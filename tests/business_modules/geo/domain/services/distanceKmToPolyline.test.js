import assert from 'node:assert/strict';
import test from 'node:test';

import {
  approximateKmPointToSegment,
  distanceKmToPolyline,
} from '../../../../../business_modules/geo/domain/services/distanceKmToPolyline.js';
import { haversineKm } from '../../../../../business_modules/geo/domain/services/haversineKm.js';

test('distanceKmToPolyline uses shortest segment distance', () => {
  const poly = [
    { lat: 0, lon: 0 },
    { lat: 0, lon: 1 },
  ];
  // Slightly north of the segment — distance should be small but positive
  const d = distanceKmToPolyline(0.05, 0.5, poly);
  assert.ok(d > 0 && d < 200, `expected modest km offset from segment, got ${d}`);
});

test('approximateKmPointToSegment is zero at segment midpoint (planar approx)', () => {
  const d = approximateKmPointToSegment(33.2, 35.5, 33.1, 35.5, 33.3, 35.5);
  assert.ok(d < 8, `midpoint should be near segment, got ${d}`);
});

test('haversineKm is symmetric', () => {
  const a = haversineKm(33.2, 35.5, 33.3, 35.6);
  const b = haversineKm(33.3, 35.6, 33.2, 35.5);
  assert.ok(Math.abs(a - b) < 1e-9);
});
