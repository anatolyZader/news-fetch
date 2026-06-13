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
    const selected = selectSpecialistComponents({
      abstentionSet: new Set(),
      focusComponents: ['narrative'],
      epistemicProfileEnriched: profile,
    });
    assert.ok(selected.includes('narrative'));
    assert.ok(selected.includes('information_communication'));
    assert.equal(selected.includes('leadership'), false);
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
