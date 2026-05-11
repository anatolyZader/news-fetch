import assert from 'node:assert/strict';
import test from 'node:test';

import { distanceBandForKm } from '../../../../../business_modules/geo/domain/services/distanceBand.js';

test('distanceBandForKm buckets', () => {
  assert.equal(distanceBandForKm(0), '0-10');
  assert.equal(distanceBandForKm(9.9), '0-10');
  assert.equal(distanceBandForKm(10), '10-25');
  assert.equal(distanceBandForKm(24.9), '10-25');
  assert.equal(distanceBandForKm(25), '25+');
  assert.equal(distanceBandForKm(Number.NaN), 'unknown');
});
