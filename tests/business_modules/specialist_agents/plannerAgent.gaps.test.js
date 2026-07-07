import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPlan, runPlannerAgent } from '../../../business_modules/specialist_agents/app/plannerAgent.js';
import { buildPlannerContext } from '../../../cross-cut-modules/retrieval/plannerContextBuilder.js';

describe('plannerAgent gaps', () => {
  it('defaultPlan emits gap_closure tasks from investigation gaps', () => {
    const epistemicProfile = {
      by_component: {
        leadership: { evidence_mass: 6, thin_evidence: false, contested: true },
      },
    };
    const evidenceGraph = {
      by_component: {
        leadership: {
          retrieval_gaps: [
            'need opposing evidence for contested leadership',
            'diversify sources: news dominates',
          ],
        },
      },
    };
    const plannerContext = buildPlannerContext({
      epistemicProfile,
      evidenceGraph,
      assessmentMode: 'normal',
    });
    const plan = defaultPlan(epistemicProfile, plannerContext);
    assert.ok(plan.gap_closure_tasks.length >= 1);
    assert.ok(plan.gap_closure_tasks.every((t) => t.type === 'gap_closure'));
  });

  it('includes archive_explore tasks from exploration candidates', () => {
    const epistemicProfile = {
      by_component: {
        information_communication: {
          evidence_mass: 0.5,
          media_mention_mass: 3,
          thin_evidence: true,
        },
      },
    };
    const plannerContext = buildPlannerContext({
      epistemicProfile,
      evidenceGraph: { by_component: {} },
      assessmentMode: 'normal',
    });
    const plan = defaultPlan(epistemicProfile, plannerContext);
    assert.ok(plan.investigation_tasks.some((t) => t.type === 'archive_explore'));
  });

  it('runPlannerAgent skips kernel on calm deterministic path', async () => {
    const epistemicProfile = {
      by_component: {
        leadership: { evidence_mass: 5, thin_evidence: false, contested: false },
      },
    };
    const plannerContext = buildPlannerContext({
      epistemicProfile,
      evidenceGraph: { by_component: {} },
      assessmentMode: 'normal',
    });
    let kernelCalled = false;
    const fakeKernel = {
      run: async () => {
        kernelCalled = true;
        return { submitPayloads: [], traceId: 'llm-trace' };
      },
    };
    const result = await runPlannerAgent({
      epistemicProfile,
      plannerContext,
      assessmentMode: 'normal',
      agentKernel: fakeKernel,
      traceId: 'parent-trace',
    });
    assert.equal(kernelCalled, false);
    assert.equal(result.plan.planner_source, 'deterministic');
    assert.ok(result.plan.focus_components.length >= 1);
    assert.equal(result.traceId, 'parent-trace:planner');
  });
});
