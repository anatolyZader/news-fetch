import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  narrativeFocusUiEnabled,
  stripOperatorGuidancePayload,
} from '../../../../../cross-cut-modules/resilience-contracts/narrativeFocusUi.js';

describe('narrativeFocusUi', () => {
  it('narrativeFocusUiEnabled is false by default', () => {
    assert.equal(narrativeFocusUiEnabled({}), false);
    assert.equal(narrativeFocusUiEnabled({ RESILIENCE_NARRATIVE_FOCUS_UI: '0' }), false);
  });

  it('narrativeFocusUiEnabled is true when RESILIENCE_NARRATIVE_FOCUS_UI=1', () => {
    assert.equal(narrativeFocusUiEnabled({ RESILIENCE_NARRATIVE_FOCUS_UI: '1' }), true);
  });

  it('stripOperatorGuidancePayload clears guidance fields', () => {
    const stripped = stripOperatorGuidancePayload({
      found: true,
      attention_items: [{ id: 'x' }],
      action_compass: { actions: [{ id: 'a' }] },
      assessment: {
        date: '2026-06-20',
        decision_brief: { summary: 'brief' },
        operator_recommendations: [{ id: 'rec:1' }],
        components: [],
      },
    });
    assert.equal(stripped.narrative_focus_ui, true);
    assert.deepEqual(stripped.attention_items, []);
    assert.equal(stripped.action_compass, null);
    assert.equal(stripped.assessment.decision_brief, undefined);
    assert.equal(stripped.assessment.operator_recommendations, undefined);
    assert.equal(stripped.assessment.date, '2026-06-20');
  });
});
