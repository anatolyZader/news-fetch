import assert from 'node:assert/strict';
import test from 'node:test';

import { NORTH_SUBREGION_IDS } from '../../../business_modules/geo/domain/value_objects/northSubregionId.js';
import { REGIONAL_PBO_REGION_IDS } from '../../../business_modules/pbo_report/domain/value_objects/regionalPboRegions.js';

test('geo north subregion ids stay aligned with regional PBO region ids', () => {
  assert.deepEqual(
    [...NORTH_SUBREGION_IDS].sort(),
    [...REGIONAL_PBO_REGION_IDS].sort(),
    'Update both lists together (pbo_report/regionalPboRegions.js and geo/northSubregionId.js)',
  );
});
