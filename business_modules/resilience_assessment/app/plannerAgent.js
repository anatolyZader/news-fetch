/**
 * Planner agent — one round investigation plan with gap-first and exploration tasks.
 */
import { createAgentKernel, HAIKU_MODEL, PROMPT_VERSION } from '../../../cross-cut-modules/agent/index.js';
import { PLANNER_TOOLS, ASSESSMENT_PLANNER_PROFILE } from '../../../cross-cut-modules/agent/profiles/assessment.profile.js';
import { COMPONENT_IDS } from '../../../cross-cut-modules/resilience-contracts/componentIds.js';
import {
  buildGapClosureTasks,
  gapPlannerEnabled,
} from '../../../cross-cut-modules/retrieval/plannerContextBuilder.js';

function buildPlannerSystem(epistemicProfile, plannerContext) {
  const gapBlock = plannerContext
    ? `\n\nPLANNER CONTEXT (gaps, anomalies, OOV):\n${JSON.stringify(plannerContext, null, 2)}`
    : '';
  const gapInstruction = gapPlannerEnabled()
    ? ' You MUST assign at least one gap_closure task per investigation gap for non-abstained components.'
    : '';
  return (
    'You are the assessment planner for Israeli community resilience reports. ' +
    'Analyze epistemic profile hints and produce an investigation plan. ' +
    'Use submit_plan with focus_components, investigation_tasks, gap_closure_tasks, abstention_components.' +
    gapInstruction +
    '\n\nFROZEN EPISTEMIC PROFILE:\n' +
    `${JSON.stringify(epistemicProfile, null, 2)}` +
    gapBlock
  );
}

function defaultPlan(epistemicProfile, plannerContext = null) {
  const focus = [];
  const abstention = [];
  for (const id of COMPONENT_IDS) {
    const ep = epistemicProfile?.by_component?.[id] ?? {};
    if (ep.thin_evidence) abstention.push(id);
    else if (ep.contested || ep.delta_significance?.startsWith('HIGH') || ep.evidence_mass >= 4) {
      focus.push(id);
    }
  }
  if (focus.length === 0) focus.push('leadership', 'functional_continuity');

  const investigation_tasks = focus.slice(0, 3).map((id, i) => ({
    id: `t${i + 1}`,
    type: 'cross_source',
    topic: id,
    component_id: id,
    sources: ['pbo', 'field', 'news'],
  }));

  if (plannerContext?.exploration_candidates?.length) {
    for (const ex of plannerContext.exploration_candidates) {
      investigation_tasks.push({
        id: ex.id,
        type: 'archive_explore',
        topic: ex.topic,
        component_id: ex.component_id,
        sources: ['news', 'field'],
        reason: ex.reason,
      });
    }
  }

  const gap_closure_tasks = plannerContext
    ? buildGapClosureTasks(plannerContext.investigation_gaps ?? [])
    : [];

  return {
    focus_components: focus.slice(0, 5),
    investigation_tasks,
    gap_closure_tasks,
    abstention_components: abstention,
    budget: { max_rounds: 12, model_tier: 'mixed' },
  };
}

/**
 * @param {object} params
 */
export async function runPlannerAgent(params) {
  const {
    epistemicProfile,
    plannerContext = null,
    llmPort,
    agentKernel,
    onUsage,
    budget,
  } = params;
  const kernel = agentKernel ?? createAgentKernel({ llmPort });
  const system = buildPlannerSystem(epistemicProfile, plannerContext);

  let plan = null;
  const result = await kernel.run({
    profile: ASSESSMENT_PLANNER_PROFILE,
    agentKind: 'planner',
    model: HAIKU_MODEL,
    maxRounds: 1,
    maxTokens: 2000,
    system,
    messages: [{
      role: 'user',
      content: 'Create investigation plan using epistemic profile and planner context (gaps, media anomalies, OOV).',
    }],
    tools: PLANNER_TOOLS,
    budget,
    onUsage,
    executeTool: async (name, input) => {
      if (name === 'submit_plan') {
        plan = input;
        return JSON.stringify({ ok: true });
      }
      return JSON.stringify({ error: 'unknown_tool' });
    },
  });

  const submitted = result.submitPayloads.find((p) => p.tool === 'submit_plan');
  plan = submitted?.payload ?? plan ?? defaultPlan(epistemicProfile, plannerContext);

  if (!plan.gap_closure_tasks?.length && plannerContext) {
    plan.gap_closure_tasks = buildGapClosureTasks(plannerContext.investigation_gaps ?? []);
  }

  return { plan, traceId: result.traceId, prompt_version: PROMPT_VERSION };
}

export { defaultPlan, buildPlannerSystem };
