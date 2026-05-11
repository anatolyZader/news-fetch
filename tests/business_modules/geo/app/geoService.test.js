import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeoService } from '../../../../business_modules/geo/app/geoService.js';
import { isGeoResolved } from '../../../../business_modules/geo/domain/value_objects/geoEnrichment.js';

function mockBundle({ localities, border }) {
  return {
    referenceVersion: 'test-v1',
    referenceSource: 'test-src',
    borderVersion: 'border-v1',
    localities,
    border,
  };
}

test('geoService resolves known Hebrew locality', () => {
  const service = createGeoService({
    northReferencePort: {
      loadNorthGeoReference() {
        return mockBundle({
          localities: [
            {
              canonicalKey: 'kiryat_shmona',
              names: ['קריית שמונה'],
              lat: 33.2079,
              lon: 35.5721,
              subregionId: 'naftali',
            },
          ],
          border: [
            { lat: 33.286, lon: 35.395 },
            { lat: 33.096, lon: 35.105 },
          ],
        });
      },
    },
  });

  const r = service.resolveLocalityName('קריית שמונה');
  assert.ok(isGeoResolved(r));
  if (isGeoResolved(r)) {
    assert.equal(r.subregionId, 'naftali');
    assert.equal(r.pboSubregionId, 'naftali');
    assert.equal(r.geoEntityType, 'locality');
    assert.equal(r.scopeConfidence, 'high');
    assert.equal(r.matchEvidence.rawInput, 'קריית שמונה');
    assert.equal(r.matchEvidence.candidateCount, 1);
    assert.equal(r.isGolan, false);
    assert.ok(Array.isArray(r.geoAreaTags) && r.geoAreaTags.includes('north'));
    assert.ok(Number.isFinite(r.distanceKmToNorthBorder));
    assert.notEqual(r.distanceBand, 'unknown');
    assert.equal(r.geoReferenceVersion, 'test-v1');
    assert.equal(r.source, 'test-src');
    assert.equal(r.quality, 'high');
    assert.equal(r.usableForMetrics, true);
    assert.equal(r.requiresReview, false);
  }
});

test('geoService omits subregionId when GEO_LEGACY_SUBREGION_ID=false', () => {
  const prev = process.env.GEO_LEGACY_SUBREGION_ID;
  process.env.GEO_LEGACY_SUBREGION_ID = 'false';
  try {
    const service = createGeoService({
      northReferencePort: {
        loadNorthGeoReference() {
          return mockBundle({
            localities: [
              {
                canonicalKey: 'kiryat_shmona',
                names: ['קריית שמונה'],
                lat: 33.2079,
                lon: 35.5721,
                subregionId: 'naftali',
              },
            ],
            border: [
              { lat: 33.286, lon: 35.395 },
              { lat: 33.096, lon: 35.105 },
            ],
          });
        },
      },
    });
    const r = service.resolveLocalityName('קריית שמונה');
    assert.ok(isGeoResolved(r));
    if (isGeoResolved(r)) {
      assert.equal(r.subregionId, undefined);
      assert.equal(r.pboSubregionId, 'naftali');
    }
  } finally {
    if (prev === undefined) delete process.env.GEO_LEGACY_SUBREGION_ID;
    else process.env.GEO_LEGACY_SUBREGION_ID = prev;
  }
});

test('geoService returns unknown for unmatched name', () => {
  const service = createGeoService({
    northReferencePort: {
      loadNorthGeoReference() {
        return mockBundle({
          localities: [
            {
              canonicalKey: 'kiryat_shmona',
              names: ['קריית שמונה'],
              lat: 33.2079,
              lon: 35.5721,
              subregionId: 'naftali',
            },
          ],
          border: [{ lat: 33.1, lon: 35.4 }, { lat: 33.2, lon: 35.4 }],
        });
      },
    },
  });

  const r = service.resolveLocalityName('עיר לא קיימת');
  assert.equal(r.kind, 'unknown');
  assert.equal(r.reason, 'NO_MATCH');
  assert.equal(r.geoReferenceVersion, 'test-v1');
});

test('geoService marks Golan subregion', () => {
  const service = createGeoService({
    northReferencePort: {
      loadNorthGeoReference() {
        return mockBundle({
          localities: [
            {
              canonicalKey: 'katzrin',
              names: ['קצרין'],
              lat: 32.995,
              lon: 35.689,
              subregionId: 'golan',
            },
          ],
          border: [{ lat: 33.1, lon: 35.4 }, { lat: 33.2, lon: 35.4 }],
        });
      },
    },
  });

  const r = service.resolveLocalityName('קצרין');
  assert.ok(isGeoResolved(r));
  if (isGeoResolved(r)) {
    assert.equal(r.isGolan, true);
    assert.ok(r.geoAreaTags.includes('golan_heights'));
  }
});
