import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  districtRelevanceFromResolvedGeo,
  homeFrontDistrictIdsFromResolvedGeo,
} from '../../../../../business_modules/geo/domain/services/districtRelevanceFromResolvedGeo.js';

describe('districtRelevanceFromResolvedGeo', () => {
  it('matches geoAreaTags for any district', () => {
    const d = districtRelevanceFromResolvedGeo('dan', {
      kind: 'resolved',
      classification: { geoAreaTags: ['dan'] },
      policy: { usableForMetrics: true, scopeConfidence: 'high' },
    });
    assert.equal(d.isRelevant, true);
    assert.equal(d.source, 'geo_tags');
  });

  it('derives homeFrontDistrictIds from tags and north pbo subregion', () => {
    const ids = homeFrontDistrictIdsFromResolvedGeo({
      kind: 'resolved',
      classification: { pboSubregionId: 'golan', geoAreaTags: ['north', 'golan_heights'] },
    });
    assert.deepEqual(ids, ['north']);
  });
});
