import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectCrossComponentContradictions } from '../../../business_modules/specialist_agents/domain/services/crossComponentConsistency.js';
import { needsReplan } from '../../../business_modules/specialist_agents/domain/services/replanPolicy.js';
import {
  requiresAdversarialRetrieval,
  validateAdversarialBeforeSubmit,
} from '../../../business_modules/specialist_agents/domain/services/contestedRetrievalPolicy.js';

describe('crossComponentConsistency', () => {
  it('detects grounded contradiction between leadership and narrative', () => {
    const issues = detectCrossComponentContradictions([
      {
        component_id: 'leadership',
        severity: 'high',
        operator_status: 'critical_failure',
        claims: [{ evidence_refs: ['src:a'] }],
      },
      {
        component_id: 'narrative',
        severity: 'moderate',
        operator_status: 'stable',
        claims: [{ evidence_refs: ['src:b'] }],
      },
    ]);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].both_grounded, true);
  });
});

describe('replanPolicy', () => {
  it('needsReplan true on cross-component issues', () => {
    const prev = process.env.RESILIENCE_ASSESS_REPLAN_HOP;
    process.env.RESILIENCE_ASSESS_REPLAN_HOP = '1';
    try {
      assert.equal(needsReplan({
        componentAssessments: [],
        crossComponentIssues: [{ both_grounded: true }],
        plan: {},
      }), true);
    } finally {
      if (prev == null) delete process.env.RESILIENCE_ASSESS_REPLAN_HOP;
      else process.env.RESILIENCE_ASSESS_REPLAN_HOP = prev;
    }
  });
});

describe('contestedRetrievalPolicy', () => {
  it('requires adversarial retrieval for contested tier A', () => {
    const prev = process.env.RESILIENCE_ASSESS_CONTESTED_ADVERSARIAL;
    process.env.RESILIENCE_ASSESS_CONTESTED_ADVERSARIAL = '1';
    try {
      assert.equal(requiresAdversarialRetrieval({ contested: true }, 'A'), true);
      assert.equal(requiresAdversarialRetrieval({ contested: true }, 'B'), false);
      const err = validateAdversarialBeforeSubmit({
        adversarialRetrievalRequired: true,
        adversarialRetrievalDone: false,
      });
      assert.ok(err?.includes('contested_requires_adversarial_retrieval'));
    } finally {
      if (prev == null) delete process.env.RESILIENCE_ASSESS_CONTESTED_ADVERSARIAL;
      else process.env.RESILIENCE_ASSESS_CONTESTED_ADVERSARIAL = prev;
    }
  });
});
