import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createGeoService } from '../../../../business_modules/geo/app/geoService.js';
import { isGeoResolved } from '../../../../business_modules/geo/domain/value_objects/geoEnrichment.js';

function mockBundle({ localities, border }) {
  return {
    referenceVersion: 'golden-v1',
    referenceSource: 'golden-src',
    borderVersion: 'golden-border-v1',
    localities,
    border,
  };
}

const corpusPath = resolve('tests', 'business_modules', 'geo', 'golden', 'geo_golden_corpus.json');
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));

function assertCorpusCase(c, serviceFor) {
  const svc = serviceFor(c.overrides ?? null);
  const out = svc.resolveLocalityName(c.input);
  assert.equal(out.kind, c.expect.kind, `case=${c.name}`);

  if (c.expect.kind === 'unknown') {
    assert.equal(out.reason, c.expect.reason, `case=${c.name}`);
    return;
  }

  assert.ok(isGeoResolved(out), `case=${c.name} expected resolved`);
  if (c.expect.canonicalKey) assert.equal(out.resolution.canonicalKey, c.expect.canonicalKey, `case=${c.name}`);
  if (c.expect.geoEntityType) assert.equal(out.geoEntityType, c.expect.geoEntityType, `case=${c.name}`);
  if (c.expect.matchMethod) assert.equal(out.resolution.matchMethod, c.expect.matchMethod, `case=${c.name}`);
  if (c.expect.usableForMetrics != null) assert.equal(out.policy.usableForMetrics, c.expect.usableForMetrics, `case=${c.name}`);
  if (c.expect.distanceSemantics != null) {
    assert.equal(out.classification?.distanceSemantics, c.expect.distanceSemantics, `case=${c.name}`);
  }
}

test('geo golden corpus', () => {
  const localities = [
    {
      canonicalKey: 'kiryat_shmona',
      names: ['קריית שמונה', 'kiryat shmona'],
      lat: 33.2079,
      lon: 35.5721,
      subregionId: 'naftali',
    },
    {
      canonicalKey: 'golan_rc',
      names: ['גולן'],
      lat: 32.994,
      lon: 35.688,
      subregionId: 'golan',
      geoEntityType: 'regional_council',
    },
  ];
  const serviceFor = (overrides) =>
    createGeoService({
      northReferencePort: {
        loadNorthGeoReference() {
          return mockBundle({
            localities,
            border: [
              { lat: 33.286, lon: 35.395 },
              { lat: 33.096, lon: 35.105 },
            ],
          });
        },
      },
      overridesPort:
        overrides && typeof overrides === 'object'
          ? {
              lookupOverride(_raw, normalized) {
                return overrides[normalized] ?? null;
              },
            }
          : null,
    });

  for (const c of corpus) {
    assertCorpusCase(c, serviceFor);
  }
});
