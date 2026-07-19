import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluatePresenceGates,
} from '../../../../../business_modules/resilience_scorer/domain/epistemic/presenceGates.js';
import {
  GROUNDING_TIER,
} from '../../../../../business_modules/resilience_scorer/domain/services/signals/groundingPolicy.js';

const COMPONENT = 'wellbeing_at_risk';

function harmItem(overrides = {}) {
  return {
    signal: {
      signal_type: 'harm_to_population',
      intensity: 'moderate',
      grounding_tier: GROUNDING_TIER.grounded,
      evidence: 'Residents hospitalized after strike on the neighborhood.',
      ...overrides,
    },
  };
}

describe('presenceGates — harm_wellbeing minIntensity regression', () => {
  it('light-intensity grounded harm_to_population does NOT trigger on wellbeing_at_risk', () => {
    const result = evaluatePresenceGates(COMPONENT, [harmItem({ intensity: 'light' })]);
    assert.equal(result.triggered, false);
    assert.equal(result.rule_id, null);
    assert.equal(result.signal_type, null);
  });

  it('moderate-intensity grounded harm_to_population triggers the harm_wellbeing rule', () => {
    const result = evaluatePresenceGates(COMPONENT, [harmItem({ intensity: 'moderate' })]);
    assert.equal(result.triggered, true);
    assert.equal(result.rule_id, 'harm_wellbeing');
    assert.equal(result.signal_type, 'harm_to_population');
    assert.ok(result.evidence_snippet);
  });

  it('severe-intensity grounded harm_to_population triggers the harm_wellbeing rule', () => {
    const result = evaluatePresenceGates(COMPONENT, [harmItem({ intensity: 'severe' })]);
    assert.equal(result.triggered, true);
    assert.equal(result.rule_id, 'harm_wellbeing');
    assert.equal(result.signal_type, 'harm_to_population');
  });

  it('ungrounded harm_to_population (no grounding_tier) does not trigger regardless of intensity', () => {
    const result = evaluatePresenceGates(COMPONENT, [
      harmItem({ intensity: 'severe', grounding_tier: undefined }),
    ]);
    assert.equal(result.triggered, false);
    assert.equal(result.rule_id, null);
  });
});
