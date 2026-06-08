import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchLandmarkGazetteer,
  buildProvisionalGeoFromLandmark,
  resetLandmarkGazetteerCache,
} from '../../../../../business_modules/geo/domain/services/landmarkGazetteer.js';
import { validateGeoEnvelope } from '../../../../../business_modules/geo/domain/value_objects/geoEnrichmentSchema.js';

describe('landmarkGazetteer', () => {
  beforeEach(() => resetLandmarkGazetteerCache());
  afterEach(() => {
    delete process.env.GEO_LANDMARK_GAZETTEER;
    resetLandmarkGazetteerCache();
  });

  it('matches highway alias', () => {
    process.env.GEO_LANDMARK_GAZETTEER = '1';
    const hit = matchLandmarkGazetteer('ליד כביש 6');
    assert.ok(hit);
    assert.equal(hit.landmarkType, 'highway');
  });

  it('builds provisional envelope with metrics disabled', () => {
    const landmark = {
      id: 'test_lm',
      displayName: 'Test landmark',
      landmarkType: 'highway',
      probableDistrict: 'north',
      probableSubregionId: 'western_galilee_coast',
    };
    const geo = buildProvisionalGeoFromLandmark('near test landmark', landmark);
    assert.equal(geo.kind, 'provisional');
    assert.equal(geo.policy.usableForMetrics, false);
    assert.equal(geo.policy.requiresReview, true);
    const v = validateGeoEnvelope(geo);
    assert.equal(v.ok, true);
  });
});
