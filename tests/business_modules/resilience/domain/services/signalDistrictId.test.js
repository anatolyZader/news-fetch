import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignedDistrictScopeMatch,
  hasExplicitSignalDistrictId,
  isLegacyNorthStructuredSource,
  signalDistrictId,
} from '../../../../../business_modules/resilience/domain/services/signalDistrictId.js';

describe('signalDistrictId', () => {
  it('returns explicit district_id when set', () => {
    assert.equal(signalDistrictId({ source_type: 'pbo', district_id: 'south' }), 'south');
    assert.equal(hasExplicitSignalDistrictId({ district_id: 'south' }), true);
  });

  it('falls back to north for legacy structured source types without district_id', () => {
    assert.equal(signalDistrictId({ source_type: 'naftali' }), 'north');
    assert.equal(isLegacyNorthStructuredSource('field_whatsapp'), true);
    assert.equal(hasExplicitSignalDistrictId({ source_type: 'naftali' }), false);
  });

  it('returns null for news without district_id', () => {
    assert.equal(signalDistrictId({ source_type: 'news' }), null);
    assert.equal(isLegacyNorthStructuredSource('news'), false);
  });

  it('assignedDistrictScopeMatch distinguishes explicit vs legacy fallback', () => {
    assert.deepEqual(
      assignedDistrictScopeMatch({ source_type: 'field', district_id: 'north' }, 'north'),
      { districtId: 'north', source: 'signal_district' },
    );
    assert.deepEqual(
      assignedDistrictScopeMatch({ source_type: 'naftali' }, 'north'),
      { districtId: 'north', source: 'legacy_north_fallback' },
    );
    assert.equal(
      assignedDistrictScopeMatch({ source_type: 'pbo', district_id: 'south' }, 'north'),
      null,
    );
  });
});
