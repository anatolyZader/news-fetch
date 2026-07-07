import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  operatorEpistemicOverlayEnabled,
  stripOperatorGuidancePayload,
} from '../../../../../cross-cut-modules/resilience-contracts/operatorEpistemicOverlay.js';

describe('operatorEpistemicOverlay', () => {
  it('operatorEpistemicOverlayEnabled is true by default', () => {
    assert.equal(operatorEpistemicOverlayEnabled({}), true);
    assert.equal(operatorEpistemicOverlayEnabled({ RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY: '1' }), true);
  });

  it('operatorEpistemicOverlayEnabled is false when RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY=0', () => {
    assert.equal(operatorEpistemicOverlayEnabled({ RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY: '0' }), false);
  });

  it('deprecated RESILIENCE_NARRATIVE_FOCUS_UI=1 disables overlay', () => {
    assert.equal(operatorEpistemicOverlayEnabled({ RESILIENCE_NARRATIVE_FOCUS_UI: '1' }), false);
  });

  it('stripOperatorGuidancePayload clears guidance fields', () => {
    const stripped = stripOperatorGuidancePayload({
      attention_items: [{ id: 'x' }],
      action_compass: { actions: [] },
      assessment: {
        decision_brief: { summary: 'brief' },
        operator_recommendations: [{ id: 'r1' }],
      },
    });
    assert.equal(stripped.operator_epistemic_overlay, false);
    assert.deepEqual(stripped.attention_items, []);
    assert.equal(stripped.action_compass, null);
    assert.equal(stripped.assessment.decision_brief, undefined);
    assert.equal(stripped.assessment.operator_recommendations, undefined);
  });
});
