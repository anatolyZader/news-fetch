import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlannerContext, buildGapClosureTasks } from '../../../cross-cut-modules/retrieval/plannerContextBuilder.js';

describe('plannerContextBuilder', () => {
  const epistemicProfile = {
    by_component: {
      information_communication: {
        evidence_mass: 0.5,
        media_mention_mass: 3,
        thin_evidence: true,
      },
      leadership: {
        evidence_mass: 5,
        media_mention_mass: 0.5,
        thin_evidence: false,
      },
    },
  };

  const evidenceGraph = {
    by_component: {
      leadership: {
        retrieval_gaps: ['diversify sources: source_type "news" exceeds 50% mass cap'],
      },
      information_communication: {
        retrieval_gaps: ['need more corroborating evidence for information_communication'],
      },
    },
  };

  it('detects media volume anomalies', () => {
    const ctx = buildPlannerContext({
      epistemicProfile,
      evidenceGraph,
      assessmentMode: 'normal',
    });
    assert.equal(ctx.media_volume_anomalies.length, 1);
    assert.equal(ctx.media_volume_anomalies[0].component_id, 'information_communication');
  });

  it('caps exploration candidates at 2', () => {
    const multiAnomalyProfile = {
      by_component: {
        a: { evidence_mass: 0, media_mention_mass: 3, thin_evidence: true },
        b: { evidence_mass: 0, media_mention_mass: 4, thin_evidence: true },
        c: { evidence_mass: 0, media_mention_mass: 5, thin_evidence: true },
      },
    };
    const ctx = buildPlannerContext({
      epistemicProfile: multiAnomalyProfile,
      evidenceGraph: { by_component: {} },
      assessmentMode: 'normal',
    });
    assert.ok(ctx.exploration_candidates.length <= 2);
  });

  it('skips exploration when abstained mode', () => {
    const ctx = buildPlannerContext({
      epistemicProfile,
      evidenceGraph,
      assessmentMode: 'abstained',
    });
    assert.equal(ctx.exploration_candidates.length, 0);
  });

  it('builds gap closure tasks for investigation gaps', () => {
    const ctx = buildPlannerContext({
      epistemicProfile,
      evidenceGraph,
      assessmentMode: 'normal',
    });
    const tasks = buildGapClosureTasks(ctx.investigation_gaps);
    assert.ok(tasks.some((t) => t.gap_type === 'investigation'));
    assert.ok(tasks.every((t) => t.type === 'gap_closure'));
  });
});
