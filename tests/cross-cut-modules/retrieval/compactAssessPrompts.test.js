import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  compactEpistemicProfileForPlanner,
  compactPlannerContextForPrompt,
  compactComponentAssessmentsForSynth,
} from '../../../cross-cut-modules/retrieval/compactAssessPrompts.js';

describe('compactAssessPrompts', () => {
  it('compactEpistemicProfileForPlanner drops dominance arrays', () => {
    const profile = {
      by_component: {
        leadership: {
          evidence_mass: 4,
          thin_evidence: false,
          contested: true,
          delta_significance: 'HIGH_UP',
          dominance_warnings: [{ message: 'single source dominates' }, { message: 'other' }],
          investigation_eligible: true,
          user_status: 'watch',
        },
      },
    };
    const compact = compactEpistemicProfileForPlanner(profile);
    const raw = JSON.stringify(profile);
    const slim = JSON.stringify(compact);
    assert.ok(slim.length < raw.length);
    assert.equal(compact.by_component.leadership.dominance, 'single source dominates');
    assert.equal(compact.by_component.leadership.investigation_eligible, true);
    assert.equal(compact.by_component.leadership.dominance_warnings, undefined);
  });

  it('compactPlannerContextForPrompt caps classified_gaps and truncates text', () => {
    const ctx = {
      classified_gaps: Array.from({ length: 20 }, () => ({
        component_id: 'leadership',
        gap_type: 'investigation',
        gap_text: 'x'.repeat(500),
        reason: 'y'.repeat(500),
      })),
      investigation_gaps: [{ component_id: 'leadership', gap_text: 'need field corroboration' }],
      exploration_candidates: Array.from({ length: 10 }, (_, i) => ({ id: `e${i}` })),
    };
    const compact = compactPlannerContextForPrompt(ctx);
    assert.equal(compact.classified_gaps.length, 12);
    assert.equal(compact.classified_gaps[0].gap_text.length, 120);
    assert.equal(compact.exploration_candidates.length, 6);
    assert.equal(compact.retrieval_gaps_by_component, undefined);
  });

  it('compactComponentAssessmentsForSynth preserves claims and strips trees', () => {
    const assessments = [{
      component_id: 'leadership',
      severity: 'high',
      confidence: 'medium',
      user_status: 'watch',
      specialist_depth: 'A',
      narrative: 'n'.repeat(1000),
      claims: [{ text: 'claim text', evidence_refs: ['src:1'] }],
      evidence_tree: [{ huge: true }],
      reasoning_trace_id: 'trace-1',
      retrieval_gaps: Array.from({ length: 10 }, (_, i) => `gap${i}`),
    }];
    const compact = compactComponentAssessmentsForSynth(assessments)[0];
    assert.equal(compact.specialist_depth, 'A');
    assert.equal(compact.narrative.length, 400);
    assert.equal(compact.claims[0].evidence_refs[0], 'src:1');
    assert.equal(compact.retrieval_gaps.length, 6);
    assert.equal(compact.evidence_tree, undefined);
    assert.equal(compact.reasoning_trace_id, undefined);
  });

  it('compactComponentAssessmentsForSynth reads legacy specialist_tier when specialist_depth absent', () => {
    const compact = compactComponentAssessmentsForSynth([{
      component_id: 'leadership',
      severity: 'high',
      specialist_tier: 'B',
      claims: [],
    }])[0];
    assert.equal(compact.specialist_depth, 'B');
  });
});
