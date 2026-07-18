import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignedDistrictScopeMatch,
  hasExplicitSignalDistrictId,
  isDefaultNorthFallbackEnabled,
  isDefaultNorthSource,
  signalDistrictId,
} from '../../../../../business_modules/resilience_scorer/domain/services/signals/signalDistrictId.js';

describe('signalDistrictId', () => {
  it('returns explicit district_id when set', () => {
    assert.equal(signalDistrictId({ source_type: 'pbo', district_id: 'south' }), 'south');
    assert.equal(hasExplicitSignalDistrictId({ district_id: 'south' }), true);
  });

  it('defaults to north for north-domain structured source types without district_id', () => {
    assert.equal(signalDistrictId({ source_type: 'naftali' }), 'north');
    assert.equal(isDefaultNorthSource('field_whatsapp'), true);
    assert.equal(hasExplicitSignalDistrictId({ source_type: 'naftali' }), false);
  });

  it('returns null for news without district_id', () => {
    assert.equal(signalDistrictId({ source_type: 'news' }), null);
    assert.equal(isDefaultNorthSource('news'), false);
  });

  it('assignedDistrictScopeMatch distinguishes explicit vs default-north', () => {
    assert.deepEqual(
      assignedDistrictScopeMatch({ source_type: 'field', district_id: 'north' }, 'north'),
      { districtId: 'north', source: 'signal_district' },
    );
    assert.deepEqual(
      assignedDistrictScopeMatch({ source_type: 'naftali' }, 'north'),
      { districtId: 'north', source: 'default_north_district' },
    );
    assert.equal(
      assignedDistrictScopeMatch({ source_type: 'pbo', district_id: 'south' }, 'north'),
      null,
    );
  });

  it('RESILIENCE_DEFAULT_NORTH_FALLBACK=false disables default north for legacy signals', () => {
    const prev = process.env.RESILIENCE_DEFAULT_NORTH_FALLBACK;
    process.env.RESILIENCE_DEFAULT_NORTH_FALLBACK = 'false';
    try {
      assert.equal(isDefaultNorthFallbackEnabled(), false);
      assert.equal(signalDistrictId({ source_type: 'naftali' }), null);
      assert.equal(
        assignedDistrictScopeMatch({ source_type: 'field' }, 'north'),
        null,
      );
      assert.equal(signalDistrictId({ source_type: 'pbo', district_id: 'north' }), 'north');
    } finally {
      if (prev === undefined) delete process.env.RESILIENCE_DEFAULT_NORTH_FALLBACK;
      else process.env.RESILIENCE_DEFAULT_NORTH_FALLBACK = prev;
    }
  });
});
