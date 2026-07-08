import { describe, it } from 'node:test';
import assert from 'node:assert';

import { computeNorrisCapacities } from '../../../../../business_modules/resilience_scorer/domain/epistemic/norrisCapacities.js';

function makeComp({ score, certainty = 0.5, evidence_mass = 5, source_diversity = 1, signals = [] } = {}) {
  return { score, certainty, evidence_mass, source_diversity, signals };
}

function makeSignal(overrides = {}) {
  return {
    signal_type: 'information_clarity',
    evidence: 'test evidence',
    _contribution_raw: 1.2,
    article_url: 'https://example.com',
    ...overrides,
  };
}

describe('computeNorrisCapacities', () => {
  it('returns 4 capacities with stable identifiers', () => {
    const scored = {
      functional_continuity: makeComp({ score: 7 }),
      wellbeing_at_risk: makeComp({ score: 5 }),
      community_capital: makeComp({ score: 6 }),
      belonging_solidarity: makeComp({ score: 6 }),
      information_communication: makeComp({ score: 8 }),
      narrative: makeComp({ score: 4 }),
      leadership: makeComp({ score: 5 }),
    };
    const caps = computeNorrisCapacities(scored, scored);
    assert.equal(caps.length, 4);
    assert.deepEqual(
      caps.map((c) => c.capacity_id),
      ['economic_development', 'social_capital', 'information_and_communication', 'community_competence'],
    );
  });

  it('uses certainty-weighted mean to derive capacity score', () => {
    const deterministic = {
      functional_continuity: makeComp({ score: 8, certainty: 0.9 }),
      wellbeing_at_risk: makeComp({ score: 4, certainty: 0.1 }),
      community_capital: makeComp({ score: 6, certainty: 0.5 }),
      belonging_solidarity: makeComp({ score: 6, certainty: 0.5 }),
      information_communication: makeComp({ score: 7, certainty: 1 }),
      narrative: makeComp({ score: 3, certainty: 0.2 }),
      leadership: makeComp({ score: 5, certainty: 0.8 }),
    };
    const caps = computeNorrisCapacities(deterministic, deterministic);
    const econ = caps.find((c) => c.capacity_id === 'economic_development');
    assert.ok(econ.score != null);
    // (8*0.9 + 4*0.1) / (0.9+0.1) = 7.6
    assert.ok(Math.abs(econ.score - 7.6) < 0.0001, `expected 7.6, got ${econ.score}`);
  });

  it('computes rapidity diagnostic from rapid_mobilization vs delayed_mobilization', () => {
    const deterministic = {
      functional_continuity: makeComp({
        score: 6,
        signals: [
          makeSignal({ signal_type: 'rapid_mobilization', _contribution_raw: 1.1 }),
          makeSignal({ signal_type: 'rapid_mobilization', _contribution_raw: 0.9 }),
          makeSignal({ signal_type: 'delayed_mobilization', _contribution_raw: -0.7 }),
        ],
      }),
      wellbeing_at_risk: makeComp({ score: 5 }),
      community_capital: makeComp({ score: 6 }),
      belonging_solidarity: makeComp({ score: 6 }),
      information_communication: makeComp({ score: 7 }),
      narrative: makeComp({ score: 3 }),
      leadership: makeComp({ score: 5 }),
    };
    const caps = computeNorrisCapacities(deterministic, deterministic);
    const econ = caps.find((c) => c.capacity_id === 'economic_development');
    assert.ok(econ.diagnostics);
    assert.ok(econ.diagnostics.rapidity != null);
  });

  it('exposes top contributors ranked by absolute raw contribution', () => {
    const deterministic = {
      functional_continuity: makeComp({
        score: 6,
        signals: [
          makeSignal({ signal_type: 'rapid_mobilization', _contribution_raw: 0.2, evidence: 'a' }),
          makeSignal({ signal_type: 'delayed_mobilization', _contribution_raw: -1.8, evidence: 'b' }),
          makeSignal({ signal_type: 'service_disruption', _contribution_raw: -0.9, evidence: 'c' }),
        ],
      }),
      wellbeing_at_risk: makeComp({ score: 5 }),
      community_capital: makeComp({ score: 6 }),
      belonging_solidarity: makeComp({ score: 6 }),
      information_communication: makeComp({ score: 7 }),
      narrative: makeComp({ score: 3 }),
      leadership: makeComp({ score: 5 }),
    };
    const caps = computeNorrisCapacities(deterministic, deterministic);
    const econ = caps.find((c) => c.capacity_id === 'economic_development');
    assert.ok(econ.top_contributors?.length);
    assert.equal(econ.top_contributors[0].signal_type, 'delayed_mobilization');
  });
});

