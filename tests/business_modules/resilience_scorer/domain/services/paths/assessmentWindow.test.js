import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  TEMPORAL_WEIGHT_FLOOR,
  VISITS_MAX_CARRY_DAYS,
  temporalWeightForOffset,
} from '../../../../../../business_modules/resilience_scorer/domain/services/paths/assessmentWindow.js';

describe('temporalWeightForOffset (decay epoch 2026-07-30)', () => {
  it('keeps the day 0-2 head unchanged', () => {
    assert.equal(temporalWeightForOffset(0), 1);
    assert.equal(temporalWeightForOffset(-1), 1);
    assert.equal(temporalWeightForOffset(1), 0.85);
    assert.equal(temporalWeightForOffset(2), 0.7);
  });

  it('decays ×0.9/day after day 2 with no 0.5 floor', () => {
    assert.ok(Math.abs(temporalWeightForOffset(3) - 0.63) < 1e-9);
    assert.ok(Math.abs(temporalWeightForOffset(7) - 0.7 * 0.9 ** 5) < 1e-9); // ≈ 0.413
    assert.ok(Math.abs(temporalWeightForOffset(14) - 0.7 * 0.9 ** 12) < 1e-9); // ≈ 0.198
    assert.ok(temporalWeightForOffset(14) < 0.5, 'old 0.5 flat floor must be gone');
  });

  it('is strictly decreasing across the visits carry horizon', () => {
    for (let day = 1; day <= VISITS_MAX_CARRY_DAYS; day++) {
      assert.ok(temporalWeightForOffset(day) < temporalWeightForOffset(day - 1),
        `weight must keep falling at day ${day}`);
    }
  });

  it('bottoms out at the floor for very old offsets', () => {
    assert.equal(temporalWeightForOffset(60), TEMPORAL_WEIGHT_FLOOR);
  });
});
