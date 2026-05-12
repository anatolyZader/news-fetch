import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectRawLocalitiesFromNorthReferenceDoc,
  groupLocalitiesIntoSubregionsForFile,
  northReferenceDocUsesSubregions,
} from '../../../../../business_modules/geo/domain/services/northReferenceDocShape.js';

test('northReferenceDocUsesSubregions is false for legacy flat localities only', () => {
  assert.equal(
    northReferenceDocUsesSubregions({
      localities: [{ canonicalKey: 'a', subregionId: 'golan' }],
    }),
    false,
  );
});

test('northReferenceDocUsesSubregions is true when a subregion bucket has rows', () => {
  assert.equal(
    northReferenceDocUsesSubregions({
      subregions: { golan: { localities: [{ canonicalKey: 'k' }] } },
    }),
    true,
  );
});

test('collectRawLocalitiesFromNorthReferenceDoc injects subregionId from parent bucket', () => {
  const rows = collectRawLocalitiesFromNorthReferenceDoc({
    subregions: {
      golan: {
        localities: [{ canonicalKey: 'katzrin', names: ['קצרין'], lat: 1, lon: 2 }],
      },
    },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].subregionId, 'golan');
  assert.equal(rows[0].canonicalKey, 'katzrin');
});

test('collectRawLocalitiesFromNorthReferenceDoc rejects subregionId mismatch vs bucket', () => {
  assert.throws(
    () =>
      collectRawLocalitiesFromNorthReferenceDoc({
        subregions: {
          golan: {
            localities: [
              { canonicalKey: 'x', subregionId: 'galma', names: ['x'], lat: 1, lon: 2 },
            ],
          },
        },
      }),
    /bucket/,
  );
});

test('groupLocalitiesIntoSubregionsForFile strips subregionId and orders by canonicalKey', () => {
  const sub = groupLocalitiesIntoSubregionsForFile([
    {
      canonicalKey: 'b',
      subregionId: 'golan',
      names: ['b'],
      lat: 1,
      lon: 2,
    },
    {
      canonicalKey: 'a',
      subregionId: 'golan',
      names: ['a'],
      lat: 1,
      lon: 2,
    },
  ]);
  assert.deepEqual(
    sub.golan.localities.map((r) => r.canonicalKey),
    ['a', 'b'],
  );
  assert.equal(sub.golan.localities[0].subregionId, undefined);
});

test('collectRawLocalitiesFromNorthReferenceDoc reads legacy top-level localities', () => {
  const rows = collectRawLocalitiesFromNorthReferenceDoc({
    localities: [
      { canonicalKey: 'katzrin', subregionId: 'golan', names: ['קצרין'], lat: 1, lon: 2 },
    ],
  });
  assert.equal(rows[0].subregionId, 'golan');
});
