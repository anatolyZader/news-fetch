import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CALIBRATION_TARGETS,
  fitSignalWeightsRidgeMock,
  getCalibrationSnapshot,
} from '../../../../../business_modules/resilience/domain/services/signalWeightsFit.js';

describe('signalWeightsFit calibration snapshot', () => {
  it('exports calibration targets and snapshot shape', () => {
    assert.ok(CALIBRATION_TARGETS.signal_to_components);
    const snap = getCalibrationSnapshot();
    assert.equal(snap.catalog_version, 'v5');
    assert.ok(snap.signal_count >= 155);
    assert.ok(snap.priors_by_type.harm_to_population);
    assert.ok(snap.component_tuning.lifesaving_behavior);
    assert.ok(snap.signal_to_components.harm_to_population);
  });
});

describe('signalWeightsFit (stub)', () => {
  it('returns null for empty or short input', () => {
    assert.equal(fitSignalWeightsRidgeMock({ labeledExamples: [] }), null);
    assert.equal(fitSignalWeightsRidgeMock({ labeledExamples: [{ score: 5 }] }), null);
  });

  it('returns null for toy varied scores (placeholder until T5)', () => {
    const out = fitSignalWeightsRidgeMock({
      labeledExamples: [{ score: 3 }, { score: 9 }],
    });
    assert.equal(out, null);
  });
});
