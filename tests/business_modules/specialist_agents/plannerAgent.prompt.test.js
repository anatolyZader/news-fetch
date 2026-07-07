import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { buildPlannerSystem } from '../../../business_modules/specialist_agents/app/plannerAgent.js';

const saved = {};

function setEnv(name, value) {
  if (!(name in saved)) saved[name] = process.env[name];
  if (value == null) delete process.env[name];
  else process.env[name] = value;
}

function restoreEnv() {
  for (const [k, v] of Object.entries(saved)) {
    if (v == null) delete process.env[k];
    else process.env[k] = v;
  }
}

const profile = {
  by_component: {
    leadership: {
      evidence_mass: 5,
      thin_evidence: false,
      contested: true,
      dominance_warnings: [{ message: 'warn' }],
      delta_significance: 'HIGH_UP',
      investigation_eligible: true,
    },
  },
};

describe('plannerAgent prompts', () => {
  beforeEach(() => {
    saved.RESILIENCE_ASSESS_SLIM_PLANNER = process.env.RESILIENCE_ASSESS_SLIM_PLANNER;
  });
  afterEach(() => restoreEnv());

  it('returns stable/dynamic split with slim planner on by default', () => {
    delete process.env.RESILIENCE_ASSESS_SLIM_PLANNER;
    const system = buildPlannerSystem(profile, { investigation_gaps: [{ component_id: 'leadership' }] });
    assert.ok(system.stable.includes('assessment planner'));
    assert.ok(system.dynamic.includes('FROZEN EPISTEMIC PROFILE'));
    assert.ok(!system.dynamic.includes('dominance_warnings'));
  });

  it('includes full profile when slim planner disabled', () => {
    setEnv('RESILIENCE_ASSESS_SLIM_PLANNER', '0');
    const system = buildPlannerSystem(profile, null);
    assert.ok(system.dynamic.includes('dominance_warnings'));
  });
});
