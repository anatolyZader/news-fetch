import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ISRAEL_DISTRICT_FILTER_ORDER,
  normalizeIsraelDistrictId,
  normalizeIsraelDistrictLabelKey,
  normalizeIsraelDistrictRefs,
} from '../../../cross-cut-modules/geo/israelDistricts.js';

describe('israelDistricts', () => {
  it('normalizes legacy tel_aviv to dan', () => {
    assert.equal(normalizeIsraelDistrictId('tel_aviv'), 'dan');
    assert.equal(normalizeIsraelDistrictLabelKey('trends.district.telAviv'), 'district.dan');
  });

  it('normalizes legacy center to jerusalem', () => {
    assert.equal(normalizeIsraelDistrictId('center'), 'jerusalem');
  });

  it('rewrites cached dashboard region breakdown', () => {
    const out = normalizeIsraelDistrictRefs({
      district: { id: 'national', labelKey: 'trends.district.national' },
      regionBreakdown: [
        { districtId: 'tel_aviv', labelKey: 'trends.district.telAviv', value: 50 },
      ],
    });
    assert.equal(out.regionBreakdown[0].districtId, 'dan');
    assert.equal(out.regionBreakdown[0].labelKey, 'district.dan');
    assert.equal(out.district.labelKey, 'district.national');
    assert.deepEqual(
      ISRAEL_DISTRICT_FILTER_ORDER,
      ['national', 'north', 'south', 'jerusalem', 'haifa', 'dan'],
    );
  });
});
