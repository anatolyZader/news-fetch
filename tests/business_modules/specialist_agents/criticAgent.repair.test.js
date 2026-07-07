import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCriticChecks, applyCriticRepair } from '../../../business_modules/specialist_agents/app/criticAgent.js';
import { detectCrossComponentContradictions } from '../../../business_modules/specialist_agents/domain/services/crossComponentConsistency.js';

function baseAssessment(overrides = {}) {
  return {
    component_id: 'leadership',
    severity: 'moderate',
    confidence: 'medium',
    operator_status: 'watch',
    narrative: 'Leadership guidance was issued.',
    claims: [{ claim_id: 'c1', text: 'Leadership guidance was issued.', evidence_refs: ['sig:1'] }],
    tool_usage: { lookup: 1, multiHop: 1 },
    ...overrides,
  };
}

describe('criticAgent repair wiring', () => {
  it('every repairable issue type triggers requiresRepair (handler table and gate stay in sync)', () => {
    // dominance_unacknowledged had a handler but was missing from the repair
    // gate; the set is now derived from the handler table.
    const assessment = baseAssessment({ narrative: 'Guidance issued.', retrieval_gaps: [] });
    const ep = {
      by_component: {
        leadership: {
          dominance_warnings: [{ layer: 'source_type', message: 'source_type "news" exceeds 50% mass cap (90%)' }],
        },
      },
    };
    const result = runCriticChecks(assessment, ep);
    assert.ok(result.issues.some((i) => i.type === 'dominance_unacknowledged'));
    assert.equal(result.requiresRepair, true);

    const repaired = applyCriticRepair({ ...assessment }, result.issues);
    assert.ok(repaired.retrieval_gaps.some((g) => g.includes('single source channel')));
    assert.ok(repaired.repair_log.some((r) => r.action === 'noted_dominance_gap'));
  });

  it('missing_evidence_refs repair adds a synthetic ref, logs it, and does not change the grounding score', () => {
    const assessment = baseAssessment({
      claims: [{ claim_id: 'c1', text: 'Leadership guidance was issued.', evidence_refs: [] }],
    });
    const before = runCriticChecks({ ...assessment, claims: assessment.claims.map((c) => ({ ...c })) }, {});
    assert.ok(before.issues.some((i) => i.type === 'missing_evidence_refs'));

    const repaired = applyCriticRepair({ ...assessment }, before.issues);
    assert.deepEqual(repaired.claims[0].evidence_refs, ['synthetic:leadership:0']);
    assert.ok(repaired.repair_log.some((r) => r.action === 'added_synthetic_ref'));

    const after = runCriticChecks(repaired, {});
    assert.equal(after.grounding_score, before.grounding_score);
    assert.ok(!after.issues.some((i) => i.type === 'missing_evidence_refs'));
  });

  it('synthetic refs do not count as grounding for cross-component contradictions', () => {
    const negative = baseAssessment({
      component_id: 'leadership',
      severity: 'high',
      operator_status: 'degrading',
      claims: [{ claim_id: 'c1', text: 'x', evidence_refs: ['synthetic:leadership:0'] }],
    });
    const positive = baseAssessment({
      component_id: 'narrative',
      severity: 'low',
      operator_status: 'stable',
      claims: [{ claim_id: 'c2', text: 'y', evidence_refs: ['sig:9'] }],
    });
    const issues = detectCrossComponentContradictions([negative, positive]);
    assert.equal(issues.length, 0, 'synthetic-only component must not raise a grounded contradiction');

    negative.claims[0].evidence_refs = ['sig:2'];
    const realIssues = detectCrossComponentContradictions([negative, positive]);
    assert.equal(realIssues.length, 1, 'real refs on both sides still contradict');
  });
});
