import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveComponentTrajectories,
  bandsFromComponentEvidence,
  TRAJECTORY_LABELS,
} from '../../../../../business_modules/resilience_scorer/domain/epistemic/trajectoryContext.js';

function priorAssessment(date, components) {
  return {
    report_date: date,
    components: Object.entries(components).map(([component_id, c]) => ({
      component_id,
      evidence_basis: { sufficiency: c.sufficiency, balance: c.balance },
      presence_gate_triggered: c.presence ?? false,
    })),
  };
}

describe('deriveComponentTrajectories', () => {
  it('labels balance movement as improving/deteriorating and no movement as stable', () => {
    const current = {
      wellbeing_at_risk: { sufficiency: 'moderate', balance: 'one_sided_pos' },
      leadership: { sufficiency: 'moderate', balance: 'one_sided_neg' },
      narrative: { sufficiency: 'moderate', balance: 'mixed' },
    };
    const prior = priorAssessment('2026-04-06', {
      wellbeing_at_risk: { sufficiency: 'moderate', balance: 'contested' },
      leadership: { sufficiency: 'adequate', balance: 'mixed' },
      narrative: { sufficiency: 'thin', balance: 'contested' },
    });
    const { by_component } = deriveComponentTrajectories(current, [prior]);
    assert.equal(by_component.wellbeing_at_risk.label, 'improving');
    assert.equal(by_component.leadership.label, 'deteriorating');
    assert.equal(by_component.narrative.label, 'stable'); // mixed vs contested: same ordinal
    assert.equal(by_component.wellbeing_at_risk.prior_date, '2026-04-06');
  });

  it('presence-gate transitions dominate balance movement', () => {
    const current = {
      wellbeing_at_risk: { sufficiency: 'moderate', balance: 'one_sided_pos', presence_gate_triggered: true },
      leadership: { sufficiency: 'moderate', balance: 'one_sided_neg', presence_gate_triggered: false },
    };
    const prior = priorAssessment('2026-04-06', {
      wellbeing_at_risk: { sufficiency: 'moderate', balance: 'one_sided_neg', presence: false },
      leadership: { sufficiency: 'moderate', balance: 'one_sided_pos', presence: true },
    });
    const { by_component } = deriveComponentTrajectories(current, [prior]);
    assert.equal(by_component.wellbeing_at_risk.label, 'deteriorating'); // gate appeared
    assert.equal(by_component.leadership.label, 'improving'); // gate cleared
  });

  it('insufficient_history when current has no primary evidence or priors are unusable', () => {
    const current = {
      wellbeing_at_risk: { sufficiency: 'none', balance: null },
      leadership: { sufficiency: 'moderate', balance: 'mixed' },
    };
    const unusablePrior = priorAssessment('2026-04-06', {
      leadership: { sufficiency: 'none', balance: null },
    });
    const { by_component, prior_dates } = deriveComponentTrajectories(current, [unusablePrior]);
    assert.equal(by_component.wellbeing_at_risk.label, 'insufficient_history');
    assert.equal(by_component.leadership.label, 'insufficient_history');
    assert.deepEqual(prior_dates, ['2026-04-06']);

    const noPriors = deriveComponentTrajectories(current, []);
    for (const entry of Object.values(noPriors.by_component)) {
      assert.equal(entry.label, 'insufficient_history');
    }
  });

  it('skips to the most recent USABLE prior when yesterday lacks the component', () => {
    const current = { leadership: { sufficiency: 'moderate', balance: 'one_sided_pos' } };
    const yesterday = priorAssessment('2026-04-06', { leadership: { sufficiency: 'none', balance: null } });
    const dayBefore = priorAssessment('2026-04-05', { leadership: { sufficiency: 'moderate', balance: 'mixed' } });
    const { by_component } = deriveComponentTrajectories(current, [yesterday, dayBefore]);
    assert.equal(by_component.leadership.label, 'improving');
    assert.equal(by_component.leadership.prior_date, '2026-04-05');
  });

  it('every emitted label is in TRAJECTORY_LABELS', () => {
    const { by_component } = deriveComponentTrajectories({}, []);
    for (const entry of Object.values(by_component)) {
      assert.ok(TRAJECTORY_LABELS.includes(entry.label));
    }
  });
});

describe('bandsFromComponentEvidence', () => {
  it('maps evidence_basis and presence gate into the comparison shape', () => {
    const bands = bandsFromComponentEvidence({
      leadership: {
        evidence_basis: { sufficiency: 'thin', balance: 'one_sided_neg' },
        critical_flags: { presence_gate: { triggered: true } },
      },
    });
    assert.deepEqual(bands.leadership, {
      sufficiency: 'thin',
      balance: 'one_sided_neg',
      presence_gate_triggered: true,
    });
  });
});
