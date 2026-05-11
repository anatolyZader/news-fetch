import assert from 'node:assert/strict';
import { readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import test from 'node:test';

import { createGeoUnknownJsonlSinkAdapter } from '../../../../../business_modules/geo/infrastructure/adapters/geoUnknownJsonlSinkAdapter.js';

test('createGeoUnknownJsonlSinkAdapter appends JSONL lines', () => {
  const filePath = join(tmpdir(), `geo-unknown-sink-${Date.now()}.jsonl`);
  try {
    const sink = createGeoUnknownJsonlSinkAdapter({ filePath });
    sink.recordUnknown({
      kind: 'unknown',
      reason: 'NO_MATCH',
      rawName: 'X',
      geoReferenceVersion: 'rv1',
      source: 'src',
    });
    const text = readFileSync(filePath, 'utf8').trim();
    const row = JSON.parse(text);
    assert.equal(row.reason, 'NO_MATCH');
    assert.equal(row.raw_name, 'X');
    assert.equal(row.geo_reference_version, 'rv1');
    assert.ok(typeof row.recorded_at === 'string');
  } finally {
    try {
      unlinkSync(filePath);
    } catch {
      /* ignore */
    }
  }
});
