import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCriticChecks, applyCriticRepair } from '../../../business_modules/resilience_assessment/app/criticAgent.js';

describe('criticAgent openness', () => {
  const epistemicProfile = {
    by_component: {
      leadership: { thin_evidence: true, contested: false, dominance_warnings: [] },
    },
  };

  it('repairs thin_evidence with high confidence', () => {
    const assessment = {
      component_id: 'leadership',
      severity: 'high',
      confidence: 'high',
      claims: [{ text: 'x', evidence_refs: ['a'] }],
      narrative: 'x',
    };
    const { issues, requiresRepair } = runCriticChecks(assessment, epistemicProfile);
    assert.ok(requiresRepair);
    const repaired = applyCriticRepair({ ...assessment }, issues);
    assert.equal(repaired.severity, 'abstain');
    assert.equal(repaired.confidence, 'low');
  });

  it('downgrades OOV critical severity', () => {
    const assessment = {
      component_id: 'leadership',
      severity: 'critical',
      confidence: 'medium',
      claims: [{
        text: 'unclassified phrase',
        evidence_refs: ['oov:k1'],
        epistemic_flags: ['unverified', 'oov_cluster'],
      }],
      narrative: 'unclassified phrase',
    };
    const ep = { by_component: { leadership: { thin_evidence: false } } };
    const { issues, requiresRepair } = runCriticChecks(assessment, ep);
    assert.ok(requiresRepair);
    const repaired = applyCriticRepair({ ...assessment }, issues);
    assert.equal(repaired.severity, 'moderate');
    assert.equal(repaired.operator_status, 'watch');
  });

  it('flags lookup_only_no_retrieval', () => {
    const assessment = {
      component_id: 'leadership',
      severity: 'moderate',
      confidence: 'high',
      claims: [{ text: 'x', evidence_refs: ['sig:1'] }],
      narrative: 'x',
      tool_usage: { lookup: 2, multiHop: 0 },
    };
    const ep = { by_component: { leadership: { thin_evidence: false } } };
    const { issues } = runCriticChecks(assessment, ep);
    assert.ok(issues.some((i) => i.type === 'lookup_only_no_retrieval'));
  });

  it('appends a clean dominance note with no percentage or mass-cap jargon and does not loop', () => {
    const ep = {
      by_component: {
        leadership: {
          thin_evidence: false,
          contested: false,
          dominance_warnings: [{
            layer: 'source_type',
            key: 'pbo',
            message: 'source_type "pbo" exceeds 50% mass cap (94.494%)',
          }],
        },
      },
    };
    const assessment = {
      component_id: 'leadership',
      severity: 'moderate',
      confidence: 'medium',
      claims: [{ text: 'x', evidence_refs: ['a'] }],
      narrative: 'Leadership: 8 signal(s).',
    };
    const first = runCriticChecks(assessment, ep);
    assert.ok(first.issues.some((i) => i.type === 'dominance_unacknowledged'));
    const repaired = applyCriticRepair({ ...assessment }, first.issues);
    assert.ok(repaired.retrieval_gaps.some((g) => g.includes('single source channel')));
    assert.doesNotMatch(repaired.narrative, /%/);
    assert.doesNotMatch(repaired.narrative, /mass cap/);
    assert.doesNotMatch(repaired.narrative, /\(pbo\)/);

    // Re-running the checks on the repaired narrative must NOT re-flag dominance (no loop).
    const second = runCriticChecks(repaired, ep);
    assert.ok(!second.issues.some((i) => i.type === 'dominance_unacknowledged'));
  });

  it('notes gap_unaddressed on repair', () => {
    const assessment = {
      component_id: 'leadership',
      severity: 'moderate',
      confidence: 'medium',
      claims: [{ text: 'x', evidence_refs: ['a'] }],
      narrative: 'x',
      retrieval_gaps: [],
      gap_closure_tasks: [{
        gap_type: 'investigation',
        action: 'diversify sources: news dominates',
        gap_id: 'leadership:div',
      }],
    };
    const ep = { by_component: { leadership: { thin_evidence: false } } };
    const { issues, requiresRepair } = runCriticChecks(assessment, ep);
    assert.ok(requiresRepair);
    const repaired = applyCriticRepair({ ...assessment }, issues);
    assert.ok(repaired.retrieval_gaps.some((g) => g.includes('Gap not fully resolved')));
  });
});
