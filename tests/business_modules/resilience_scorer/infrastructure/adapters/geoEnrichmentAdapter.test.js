import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeoEnrichmentAdapter, createNoOpGeoEnrichmentPort } from '../../../../../business_modules/resilience_scorer/infrastructure/adapters/geoEnrichmentAdapter.js';

test('GeoEnrichmentAdapter delegates to geoService', () => {
  const adapter = createGeoEnrichmentAdapter({
    geoService: {
      resolveLocalityName(name) {
        return { kind: 'resolved', matchedName: name, pboSubregionId: 'naftali' };
      },
    },
  });
  const r = adapter.resolveLocalityName('x');
  assert.equal(r.kind, 'resolved');
  assert.equal(r.pboSubregionId, 'naftali');
});

test('GeoEnrichmentAdapter records unknown sink for NO_MATCH', () => {
  const recorded = [];
  const unknownEnv = {
    kind: 'unknown',
    reason: 'NO_MATCH',
    rawName: 'Nowhere',
    geoReferenceVersion: 'v1',
    source: 'test',
  };
  const adapter = createGeoEnrichmentAdapter({
    geoService: {
      resolveLocalityName() {
        return unknownEnv;
      },
    },
    unknownSink: {
      recordUnknown(e) {
        recorded.push(e);
      },
    },
  });
  const r = adapter.resolveLocalityName('Nowhere');
  assert.equal(r.kind, 'unknown');
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].reason, 'NO_MATCH');
});

test('NoOpGeoEnrichmentPort returns GEO_DISABLED', () => {
  const p = createNoOpGeoEnrichmentPort();
  const r = p.resolveLocalityName('anything');
  assert.equal(r.kind, 'unknown');
  assert.equal(r.reason, 'GEO_DISABLED');
});
