import assert from 'node:assert/strict';
import test from 'node:test';

import {
  groupSignalsByDistanceBand,
  groupSignalsBySubregion,
  summarizeGeoCoverage,
} from '../../../../../business_modules/geo/domain/services/geoAggregation.js';

test('summarizeGeoCoverage ignores items without geo field', () => {
  const s = summarizeGeoCoverage([{ x: 1 }, { geo: { kind: 'resolved' } }, { geo: { kind: 'unknown', rawName: 'x' } }]);
  assert.equal(s.withGeoField, 2);
  assert.equal(s.resolved, 1);
  assert.equal(s.unknown, 1);
});

test('groupSignalsBySubregion buckets resolved and no-geo', () => {
  const g = groupSignalsBySubregion([
    { id: 1, geo: { kind: 'resolved', pboSubregionId: 'naftali' } },
    { id: 2 },
    { id: 3, geo: { kind: 'unknown' } },
  ]);
  assert.ok(g.naftali?.length === 1);
  assert.ok(g._no_geo?.length === 1);
  assert.ok(g._unknown?.length === 1);
});

test('groupSignalsByDistanceBand', () => {
  const g = groupSignalsByDistanceBand([
    { geo: { kind: 'resolved', distanceBand: '0-10' } },
    { geo: { kind: 'resolved', distanceBand: '25+' } },
  ]);
  assert.equal(g['0-10']?.length, 1);
  assert.equal(g['25+']?.length, 1);
});
