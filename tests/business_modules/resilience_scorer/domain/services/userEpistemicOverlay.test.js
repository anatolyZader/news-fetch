import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  userEpistemicOverlayEnabled,
} from '../../../../../business_modules/resilience_scorer/domain/contracts/userEpistemicOverlay.js';

describe('userEpistemicOverlay', () => {
  it('userEpistemicOverlayEnabled is true by default', () => {
    assert.equal(userEpistemicOverlayEnabled({}), true);
    assert.equal(userEpistemicOverlayEnabled({ RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY: '1' }), true);
  });

  it('userEpistemicOverlayEnabled is false when RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY=0', () => {
    assert.equal(userEpistemicOverlayEnabled({ RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY: '0' }), false);
  });

  it('deprecated RESILIENCE_NARRATIVE_FOCUS_UI=1 disables overlay', () => {
    assert.equal(userEpistemicOverlayEnabled({ RESILIENCE_NARRATIVE_FOCUS_UI: '1' }), false);
  });
});
