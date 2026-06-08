import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { buildSynthesizerSystem } from '../../../business_modules/resilience_assessment/app/synthesizerAgent.js';

const saved = {};

function restoreEnv() {
  if ('RESILIENCE_ASSESS_SLIM_SYNTH' in saved) {
    process.env.RESILIENCE_ASSESS_SLIM_SYNTH = saved.RESILIENCE_ASSESS_SLIM_SYNTH;
  } else {
    delete process.env.RESILIENCE_ASSESS_SLIM_SYNTH;
  }
}

const assessments = [{
  component_id: 'leadership',
  severity: 'high',
  confidence: 'medium',
  operator_status: 'watch',
  specialist_tier: 'A',
  narrative: 'Important finding',
  claims: [{ text: 'Mayor urged sheltering', evidence_refs: ['md:2026-05-30:1'] }],
  evidence_tree: [{ node: 'large' }],
  retrieval_gaps: ['need more field reports'],
}];

const epistemicProfile = {
  by_component: {
    leadership: {
      evidence_mass: 4,
      thin_evidence: false,
      contested: false,
      dominance_warnings: [{ message: 'x' }],
    },
  },
};

describe('synthesizerAgent prompts', () => {
  beforeEach(() => {
    saved.RESILIENCE_ASSESS_SLIM_SYNTH = process.env.RESILIENCE_ASSESS_SLIM_SYNTH;
  });
  afterEach(() => restoreEnv());

  it('slim synth omits evidence trees but keeps claim refs and oov_claims', () => {
    delete process.env.RESILIENCE_ASSESS_SLIM_SYNTH;
    const withOov = [{
      ...assessments[0],
      claims: [
        { text: 'Mayor urged sheltering', evidence_refs: ['md:2026-05-30:1'] },
        { text: 'Unknown phrasing burst', epistemic_flags: ['oov_cluster', 'unverified'] },
      ],
    }];
    const system = buildSynthesizerSystem(withOov, epistemicProfile);
    assert.ok(system.stable.includes('submit_synthesis'));
    assert.ok(system.dynamic.includes('md:2026-05-30:1'));
    assert.ok(system.dynamic.includes('oov_claims'));
    assert.ok(!system.dynamic.includes('evidence_tree'));
  });

  it('full dump when slim synth disabled', () => {
    process.env.RESILIENCE_ASSESS_SLIM_SYNTH = '0';
    const system = buildSynthesizerSystem(assessments, epistemicProfile);
    assert.ok(system.dynamic.includes('evidence_tree'));
  });
});
