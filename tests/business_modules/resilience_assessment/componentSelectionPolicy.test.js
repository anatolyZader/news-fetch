import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectSpecialistComponents } from '../../../business_modules/resilience_assessment/domain/services/componentSelectionPolicy.js';

describe('componentSelectionPolicy.selectSpecialistComponents', () => {
  const profile = {
    by_component: {
      narrative: { thin_evidence: false, investigation_eligible: true, evidence_mass: 77 },
      information_communication: { thin_evidence: false, investigation_eligible: true, evidence_mass: 57 },
      leadership: { thin_evidence: true, investigation_eligible: false, evidence_mass: 0.8 },
    },
  };

  it('includes focus components and investigation-eligible non-focus components', () => {
    const prevOverlay = process.env.RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY;
    const prevFocus = process.env.RESILIENCE_NARRATIVE_FOCUS_UI;
    const prevMode = process.env.RESILIENCE_NARRATIVE_EPISTEMIC_MODE;
    process.env.RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY = '1';
    delete process.env.RESILIENCE_NARRATIVE_FOCUS_UI;
    delete process.env.RESILIENCE_NARRATIVE_EPISTEMIC_MODE;
    try {
      const selected = selectSpecialistComponents({
        abstentionSet: new Set(),
        focusComponents: ['narrative'],
        epistemicProfileEnriched: profile,
      });
      assert.ok(selected.includes('narrative'));
      assert.ok(selected.includes('information_communication'));
      assert.equal(selected.includes('leadership'), false);
    } finally {
      if (prevOverlay === undefined) delete process.env.RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY;
      else process.env.RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY = prevOverlay;
      if (prevFocus === undefined) delete process.env.RESILIENCE_NARRATIVE_FOCUS_UI;
      else process.env.RESILIENCE_NARRATIVE_FOCUS_UI = prevFocus;
      if (prevMode === undefined) delete process.env.RESILIENCE_NARRATIVE_EPISTEMIC_MODE;
      else process.env.RESILIENCE_NARRATIVE_EPISTEMIC_MODE = prevMode;
    }
  });

  it('still includes explicit abstention components (assessed with abstain flag)', () => {
    const selected = selectSpecialistComponents({
      abstentionSet: new Set(['leadership']),
      focusComponents: ['narrative'],
      epistemicProfileEnriched: profile,
    });
    assert.ok(selected.includes('leadership'));
  });
});
