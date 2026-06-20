import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  enrichProfileForInvestigation,
  shouldAbstainFromInvestigation,
} from '../../../business_modules/epistemic_features/domain/services/investigationEpistemic.js';

describe('investigationEpistemic', () => {
  it('enriches investigation_eligible from archive mass when thin for scoring', () => {
    const prev = process.env.RESILIENCE_ASSESS_SPLIT_INVESTIGATION_MASS;
    process.env.RESILIENCE_ASSESS_SPLIT_INVESTIGATION_MASS = '1';
    try {
      const profile = {
        by_component: {
          leadership: {
            evidence_mass: 0.5,
            thin_evidence: true,
            contested: false,
            media_mention_mass: 0,
          },
        },
      };
      const enriched = enrichProfileForInvestigation(profile, {
        signals: [],
        archiveMentionMass: { leadership: 3 },
        residualByComponent: {},
      });
      const ep = enriched.by_component.leadership;
      assert.equal(ep.thin_for_scoring, true);
      assert.equal(ep.investigation_eligible, true);
      assert.equal(shouldAbstainFromInvestigation(ep), false);
    } finally {
      if (prev == null) delete process.env.RESILIENCE_ASSESS_SPLIT_INVESTIGATION_MASS;
      else process.env.RESILIENCE_ASSESS_SPLIT_INVESTIGATION_MASS = prev;
    }
  });

  it('shouldAbstainFromInvestigation falls back to thin_evidence when split off', () => {
    const prev = process.env.RESILIENCE_ASSESS_SPLIT_INVESTIGATION_MASS;
    process.env.RESILIENCE_ASSESS_SPLIT_INVESTIGATION_MASS = '0';
    try {
      assert.equal(shouldAbstainFromInvestigation({ thin_evidence: true }), true);
      assert.equal(shouldAbstainFromInvestigation({ thin_evidence: false }), false);
    } finally {
      if (prev == null) delete process.env.RESILIENCE_ASSESS_SPLIT_INVESTIGATION_MASS;
      else process.env.RESILIENCE_ASSESS_SPLIT_INVESTIGATION_MASS = prev;
    }
  });

  it('shouldAbstainFromInvestigation returns false when narrativePermissive', () => {
    assert.equal(shouldAbstainFromInvestigation({ thin_evidence: true }, { narrativePermissive: true }), false);
  });
});
