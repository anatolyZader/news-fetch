import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  operatorEpistemicOverlayEnabled,
} from '../../../../../business_modules/resilience_scorer/domain/contracts/operatorEpistemicOverlay.js';

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
});
