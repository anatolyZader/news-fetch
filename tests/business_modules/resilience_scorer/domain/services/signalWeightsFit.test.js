import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CALIBRATION_TARGETS,
  fitSignalWeightsRidgeMock,
  getCalibrationSnapshot,
} from '../../../../../business_modules/resilience_scorer/domain/services/signals/signalWeightsFit.js';

describe('signalWeightsFit calibration snapshot', () => {
  it('exports calibration targets and snapshot shape', () => {
    assert.ok(CALIBRATION_TARGETS.signal_to_components);
    const snap = getCalibrationSnapshot();
    assert.equal(snap.catalog_version, 'v8');
    assert.ok(snap.signal_count >= 165);
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

  it('returns null for toy varied scores below minReports', () => {
    const out = fitSignalWeightsRidgeMock({
      labeledExamples: [{ score: 3 }, { score: 9 }],
    });
    assert.equal(out, null);
  });

  it('returns shadow RGR payload when report count meets threshold', () => {
    const examples = Array.from({ length: 30 }, (_, i) => ({ score: 5 + (i % 3) }));
    const out = fitSignalWeightsRidgeMock({ labeledExamples: examples });
    assert.ok(out);
    assert.equal(out.mode, 'shadow_rgr');
    assert.equal(out.example_count, 30);
    assert.ok(out.weights.harm_to_population);
  });
});
