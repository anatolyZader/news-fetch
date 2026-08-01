import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getMunicipalityDashboard,
  resetMunicipalityDashboardCacheForTests,
} from '../../../../business_modules/pbo_report/app/pboMunicipalityService.js';

beforeEach(() => resetMunicipalityDashboardCacheForTests());

describe('getMunicipalityDashboard cache', () => {
  it('returns the identical object on a second call (memo hit)', () => {
    const first = getMunicipalityDashboard('north');
    const second = getMunicipalityDashboard('north');
    assert.equal(second, first);
  });

  it('bypasses the memo when disabled', () => {
    process.env.MUNI_DASHBOARD_CACHE_ENABLED = 'false';
    try {
      const first = getMunicipalityDashboard('north');
      const second = getMunicipalityDashboard('north');
      assert.notEqual(second, first);
      assert.deepEqual(second.sourceFiles, first.sourceFiles);
    } finally {
      delete process.env.MUNI_DASHBOARD_CACHE_ENABLED;
    }
  });
});
