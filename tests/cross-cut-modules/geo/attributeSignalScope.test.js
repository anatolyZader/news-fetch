import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { attributeSignalScope } from '../../../cross-cut-modules/geo/attributeSignalScope.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('attributeSignalScope preserves explicit district_id', () => {
  const { signals, districtStamped } = attributeSignalScope(
    [{ source_type: 'pbo', district_id: 'south', evidence: 'x' }],
    { rootDir: ROOT, sourceType: 'pbo', bundleDistrictId: 'north' },
  );
  assert.equal(signals[0].district_id, 'south');
  assert.equal(districtStamped, 0);
});

test('attributeSignalScope resolves geo and stamps district_id from municipality', () => {
  const { signals, attached, districtStamped } = attributeSignalScope(
    [
      {
        source_type: 'pbo',
        municipality: 'כרמיאל',
        evidence: '[כרמיאל] service continuity',
        signal_type: 'service_continuity',
      },
    ],
    { rootDir: ROOT, sourceType: 'pbo', bundleDistrictId: 'north' },
  );
  assert.equal(attached, 1);
  assert.ok(signals[0].geo);
  assert.equal(signals[0].district_id, 'north');
  assert.equal(districtStamped, 1);
});

test('attributeSignalScope is idempotent when geo and district_id already set', () => {
  const input = {
    source_type: 'news',
    district_id: 'north',
    geo: { kind: 'resolved', geoAreaTags: ['north'] },
    evidence: 'already attributed',
  };
  const { signals, attached, districtStamped } = attributeSignalScope([input], {
    rootDir: ROOT,
    sourceType: 'news',
  });
  assert.equal(attached, 0);
  assert.equal(districtStamped, 0);
  assert.equal(signals[0], input);
});

test('attributeSignalScope uses bundleDistrictId when signal has no district_id', () => {
  const { signals, districtStamped } = attributeSignalScope(
    [{ source_type: 'visits', evidence: 'generic field note without geo' }],
    { rootDir: ROOT, sourceType: 'field', bundleDistrictId: 'north' },
  );
  assert.equal(signals[0].district_id, 'north');
  assert.equal(districtStamped, 1);
});
