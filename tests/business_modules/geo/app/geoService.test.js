import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeoService } from '../../../../business_modules/geo/app/geoService.js';
import { isGeoResolved } from '../../../../business_modules/geo/domain/value_objects/geoEnrichment.js';
import { resolveByFuzzyBest } from '../../../../business_modules/geo/domain/services/resolveLocalityMatch.js';
import { GEO_POLICY_VERSION } from '../../../../business_modules/geo/domain/services/geoQualityPolicy.js';

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
    assert.equal(r.geoPolicyVersion, GEO_POLICY_VERSION);
    assert.ok(r.resolution && r.classification && r.policy && r.audit);
    assert.equal(r.resolution.canonicalKey, 'kiryat_shmona');
    assert.equal(r.classification.pboSubregionId, 'naftali');
    assert.equal(r.classification.distanceSemantics, 'point_to_polyline');
    assert.equal(r.policy.geoPolicyVersion, GEO_POLICY_VERSION);
    assert.equal(r.subregionId, undefined);
    assert.equal(r.pboSubregionId, 'naftali');
    assert.equal(r.envelopeSchemaVersion, 'geo-envelope-2026-05-v1');
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
    assert.equal(r.scopeDecision.isNorthRelevant, true);
    assert.equal(r.scopeDecision.source, 'geo_tags');
    assert.ok(r.scopeDecision.reasons.some((x) => x.includes('geoAreaTags')));
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

test('geoService resolves Hebrew גולן to reference row as regional_council', () => {
  const service = createGeoService({
    northReferencePort: {
      loadNorthGeoReference() {
        return mockBundle({
          localities: [
            {
              canonicalKey: 'golan_rc',
              names: ['גולן', 'מועצה אזורית גולן'],
              lat: 32.994,
              lon: 35.688,
              subregionId: 'golan',
              geoEntityType: 'regional_council',
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

  const r = service.resolveLocalityName('גולן');
  assert.ok(isGeoResolved(r));
  if (isGeoResolved(r)) {
    assert.equal(r.kind, 'resolved');
    assert.equal(r.geoEntityType, 'regional_council');
    assert.equal(r.resolution.geoEntityType, 'regional_council');
    assert.equal(r.classification.distanceSemantics, 'representative_centroid_to_polyline');
    assert.equal(r.usableForMetrics, false);
    assert.equal(r.requiresReview, true);
    assert.equal(r.quality, 'medium');
    assert.ok(r.policy.decisionReasons?.includes('centroid_geometry_only'));
    assert.equal(r.isGolan, true);
    assert.equal(r.scopeDecision.isNorthRelevant, false);
    assert.equal(r.scopeDecision.source, 'geo');
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
  assert.ok(r.audit && r.resolution);
});

test('geoService returns NON_LOCALITY_AREA_TERM for "צפון"', () => {
  const service = createGeoService({
    northReferencePort: {
      loadNorthGeoReference() {
        return mockBundle({
          localities: [
            { canonicalKey: 'kiryat_shmona', names: ['קריית שמונה'], lat: 33, lon: 35, subregionId: 'naftali' },
          ],
          border: [{ lat: 33.1, lon: 35.4 }, { lat: 33.2, lon: 35.4 }],
        });
      },
    },
  });
  const r = service.resolveLocalityName('צפון');
  assert.equal(r.kind, 'unknown');
  assert.equal(r.reason, 'NON_LOCALITY_AREA_TERM');
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

test('geoService uses overridesPort before fuzzy', () => {
  const service = createGeoService({
    northReferencePort: {
      loadNorthGeoReference() {
        return mockBundle({
          localities: [
            { canonicalKey: 'kiryat_shmona', names: ['קריית שמונה'], lat: 33.2, lon: 35.5, subregionId: 'naftali' },
            { canonicalKey: 'metula', names: ['מטולה'], lat: 33.28, lon: 35.57, subregionId: 'naftali' },
          ],
          border: [{ lat: 33.1, lon: 35.4 }, { lat: 33.2, lon: 35.4 }],
        });
      },
    },
    overridesPort: {
      lookupOverride(_raw, normalized) {
        if (normalized === 'קרית שמונה') return { canonicalKey: 'kiryat_shmona', geoEntityType: 'locality' };
        return null;
      },
    },
  });

  const r = service.resolveLocalityName('קרית שמונה');
  assert.ok(isGeoResolved(r));
  if (isGeoResolved(r)) {
    assert.equal(r.canonicalKey, 'kiryat_shmona');
    assert.equal(r.matchMethod, 'manual_override');
    assert.equal(r.matchConfidence, 1);
  }
});

test('geoService does not auto-resolve fuzzy below metrics threshold', () => {
  const localities = [
    { canonicalKey: 'kiryat_shmona', names: ['kiryat shmona'], lat: 33.2, lon: 35.5, subregionId: 'naftali' },
  ];
  const pick = [
    'kiryat shmon',
    'kiryat smona',
    'kiryat shona',
    'kiryat shemona',
    'kiryat shmonah',
  ];

  let chosen = null;
  for (const v of pick) {
    const r = resolveByFuzzyBest(localities, v);
    if ('row' in r && r.matchConfidence >= 0.88 && r.matchConfidence < 0.95) {
      chosen = v;
      break;
    }
  }
  assert.ok(chosen, 'Expected at least one variant to be fuzzy-resolved below 0.95');

  const service = createGeoService({
    northReferencePort: {
      loadNorthGeoReference() {
        return mockBundle({
          localities,
          border: [{ lat: 33.1, lon: 35.4 }, { lat: 33.2, lon: 35.4 }],
        });
      },
    },
  });
  const out = service.resolveLocalityName(chosen);
  assert.equal(out.kind, 'unknown');
  assert.equal(out.reason, 'NO_CONFIDENT_MATCH');
});
