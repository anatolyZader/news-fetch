import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeoService } from '../../../../../business_modules/geo/app/geoService.js';
import { searchLocalities, isGeoExactOnlyEnabled } from '../../../../../business_modules/geo/domain/services/searchLocalities.js';

function mockBundle({ localities, border }) {
  return {
    referenceVersion: 'test-v1',
    referenceSource: 'test-src',
    borderVersion: 'border-v1',
    localities,
    border,
  };
}

const LOCALITIES = [
  {
    canonicalKey: 'kiryat_shmona',
    officialHebrewName: 'קריית שמונה',
    names: ['קריית שמונה', 'Kiryat Shmona'],
    lat: 33.2079,
    lon: 35.5721,
    subregionId: 'naftali',
  },
  {
    canonicalKey: 'metula',
    officialHebrewName: 'מטולה',
    names: ['מטולה'],
    lat: 33.28,
    lon: 35.57,
    subregionId: 'naftali',
  },
];

const BORDER = [
  { lat: 33.286, lon: 35.395 },
  { lat: 33.096, lon: 35.105 },
];

test('searchLocalities filters by query prefix', () => {
  const hits = searchLocalities(LOCALITIES, 'מט', { limit: 5 });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].canonicalKey, 'metula');
});

test('geoService.searchLocalities returns canonical entries', () => {
  const service = createGeoService({
    northReferencePort: {
      loadNorthGeoReference() {
        return mockBundle({ localities: LOCALITIES, border: BORDER });
      },
    },
  });
  const hits = service.searchLocalities('קריית', { limit: 5 });
  assert.ok(hits.some((h) => h.canonicalKey === 'kiryat_shmona'));
});

test('geoService exact-only skips fuzzy match', () => {
  const prev = process.env.RESILIENCE_GEO_EXACT_ONLY;
  process.env.RESILIENCE_GEO_EXACT_ONLY = '1';
  try {
    const service = createGeoService({
      northReferencePort: {
        loadNorthGeoReference() {
          return mockBundle({ localities: LOCALITIES, border: BORDER });
        },
      },
    });
    const r = service.resolveLocalityName('Kiryat Shmona');
    assert.equal(r.kind, 'unknown');
    assert.equal(r.reason, 'NO_CONFIDENT_MATCH');
  } finally {
    if (prev === undefined) delete process.env.RESILIENCE_GEO_EXACT_ONLY;
    else process.env.RESILIENCE_GEO_EXACT_ONLY = prev;
  }
});

test('isGeoExactOnlyEnabled respects env', () => {
  const prev = process.env.RESILIENCE_GEO_EXACT_ONLY;
  process.env.RESILIENCE_GEO_EXACT_ONLY = '1';
  assert.equal(isGeoExactOnlyEnabled(), true);
  process.env.RESILIENCE_GEO_EXACT_ONLY = '0';
  assert.equal(isGeoExactOnlyEnabled(), false);
  if (prev === undefined) delete process.env.RESILIENCE_GEO_EXACT_ONLY;
  else process.env.RESILIENCE_GEO_EXACT_ONLY = prev;
});
