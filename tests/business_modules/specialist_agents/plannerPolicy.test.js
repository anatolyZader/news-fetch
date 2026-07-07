import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { needsLlmPlanner, shouldUseDeterministicPlanner } from '../../../business_modules/specialist_agents/domain/services/plannerPolicy.js';

describe('plannerPolicy', () => {
  it('needsLlmPlanner false on calm normal day', () => {
    assert.equal(needsLlmPlanner({
      assessmentMode: 'normal',
      plannerContext: {
        media_volume_anomalies: [],
        exploration_candidates: [],
      },
    }), false);
  });

  it('needsLlmPlanner true when OOV summary present', () => {
    assert.equal(needsLlmPlanner({
      assessmentMode: 'normal',
      plannerContext: { oov_summary: { cluster_count: 2 } },
    }), true);
  });

  it('needsLlmPlanner true on media anomalies', () => {
    assert.equal(needsLlmPlanner({
      assessmentMode: 'normal',
      plannerContext: {
        media_volume_anomalies: [{ component_id: 'leadership' }],
      },
    }), true);
  });

  it('needsLlmPlanner true on exploration candidates', () => {
    assert.equal(needsLlmPlanner({
      assessmentMode: 'normal',
      plannerContext: {
        exploration_candidates: [{ id: 'ex1', component_id: 'leadership' }],
      },
    }), true);
  });

  it('needsLlmPlanner true when assessmentMode is not normal', () => {
    assert.equal(needsLlmPlanner({
      assessmentMode: 'degraded',
      plannerContext: {},
    }), true);
  });

  it('shouldUseDeterministicPlanner respects env flag', () => {
    const prev = process.env.RESILIENCE_ASSESS_DETERMINISTIC_PLANNER;
    process.env.RESILIENCE_ASSESS_DETERMINISTIC_PLANNER = '0';
    try {
      assert.equal(shouldUseDeterministicPlanner({
        assessmentMode: 'normal',
        plannerContext: {},
      }), false);
    } finally {
      if (prev == null) delete process.env.RESILIENCE_ASSESS_DETERMINISTIC_PLANNER;
      else process.env.RESILIENCE_ASSESS_DETERMINISTIC_PLANNER = prev;
    }
  });
});
