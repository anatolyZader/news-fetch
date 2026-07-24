import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExposureContext,
  EXPOSURE_SIGNAL_TYPES,
} from '../../../../../business_modules/resilience_scorer/domain/epistemic/exposureContext.js';

describe('buildExposureContext', () => {
  it('summarizes exposure signals into counts, max intensity, and affected sets', () => {
    const signals = [
      { signal_type: 'harm_to_population', intensity: 'severe', affected_subgroup: 'children' },
      { signal_type: 'harm_to_population', intensity: 'light' },
      { signal_type: 'evacuation_displacement', intensity: 'moderate', affected_system: 'housing' },
      { signal_type: 'compliance_enter_shelter', intensity: 'severe' }, // not an exposure type
    ];
    const ctx = buildExposureContext(signals);
    assert.deepEqual(ctx.event_counts, { harm_to_population: 2, evacuation_displacement: 1 });
    assert.equal(ctx.max_intensity, 'severe');
    assert.deepEqual(ctx.affected_subgroups, ['children']);
    assert.deepEqual(ctx.affected_systems, ['housing']);
    assert.equal(ctx.total_exposure_signals, 3);
  });

  it('returns an empty summary for no signals and null max intensity when unstated', () => {
    const empty = buildExposureContext([]);
    assert.deepEqual(empty.event_counts, {});
    assert.equal(empty.max_intensity, null);
    assert.equal(empty.total_exposure_signals, 0);

    const noIntensity = buildExposureContext([{ signal_type: 'cyber_attack_on_infrastructure' }]);
    assert.equal(noIntensity.max_intensity, null);
    assert.equal(noIntensity.total_exposure_signals, 1);
  });

  it('exposure type list stays count-based and canonical', () => {
    assert.ok(EXPOSURE_SIGNAL_TYPES.includes('harm_to_population'));
    assert.ok(EXPOSURE_SIGNAL_TYPES.includes('displacement_resolved'));
  });
});
