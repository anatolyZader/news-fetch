import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TREND_DISTRICTS,
  TREND_DISTRICT_FILTER_ORDER,
  resolveTrendDistrict,
} from '../../../../business_modules/search_trends/domain/trendDistricts.js';

describe('trendDistricts', () => {
  it('lists six regional districts plus national', () => {
    const regional = TREND_DISTRICTS.filter((d) => d.id !== 'national').map((d) => d.id);
    assert.deepEqual(regional, ['north', 'south', 'jerusalem', 'haifa', 'center', 'dan']);
    assert.deepEqual(TREND_DISTRICT_FILTER_ORDER, [
      'national',
      'north',
      'south',
      'jerusalem',
      'haifa',
      'center',
      'dan',
    ]);
  });

  it('resolves legacy tel_aviv id to dan', () => {
    assert.equal(resolveTrendDistrict('tel_aviv').id, 'dan');
    assert.equal(resolveTrendDistrict('dan').labelKey, 'district.dan');
  });
});
