/**
 * Main assessment agent orchestrator — planner → specialists → critic → synthesizer.
 */
import { createAgentKernel, createAgentBudgetGovernor, assessmentAgentMaxUsd, assessmentAgentMaxRounds, PROMPT_VERSION, MODEL_CARD_REF } from '../../../cross-cut-modules/agent/index.js';
import { createMultiHopRetrieval } from '../../../cross-cut-modules/retrieval/multiHopRetrieval.js';
import { buildEvidenceGraph } from '../../../cross-cut-modules/retrieval/evidenceGraph.js';
import { seedComponentRagHits, dedupeHits } from '../../../cross-cut-modules/retrieval/componentRagSeeding.js';
import { buildPlannerContext } from '../../../cross-cut-modules/retrieval/plannerContextBuilder.js';
import {
  ASSESSMENT_SCHEMA_VERSION,
  createEmptyAssessmentV2,
  validateAssessmentV2,
} from '../../../cross-cut-modules/resilience-contracts/assessmentV2.js';
import { COMPONENT_IDS } from '../../../cross-cut-modules/resilience-contracts/componentIds.js';
import { runPlannerAgent } from './plannerAgent.js';
import { runComponentSpecialist } from './componentSpecialistAgent.js';
import { runCriticChecks, applyCriticRepair } from './criticAgent.js';
import { runSynthesizerAgent } from './synthesizerAgent.js';
import { mapAssessmentV2ToLegacy } from '../domain/services/assessmentV2Mapper.js';

/**
 * @param {object} params
 */
export async function runAssessmentAgent(params) {
  const {
    signals,
    epistemicProfile,
    retrievalService = null,
    reportDate,
    reportScopeId = 'national',
    totalArticles = 0,
    assessmentMode = 'normal',
    llmPort,
    agentKernel,
    onUsage,
    dataVoid = null,
    epistemicStatus = null,
    sourceArchive = null,
    evidenceStore = null,
    scopedSignals = null,
    oovBurst = null,
  } = params;

  const budget = createAgentBudgetGovernor({
    maxUsd: assessmentAgentMaxUsd(),
    maxToolRounds: assessmentAgentMaxRounds(),
  });
  const kernel = agentKernel ?? createAgentKernel({ llmPort });
  const traceId = `${reportScopeId}-${reportDate}-${Date.now().toString(36)}`;

  const retrieval = retrievalService?.retrieval ?? null;
  const multiHop = createMultiHopRetrieval({
    retrieval,
    reportsDir: params.reportsDir ?? 'daily_reports',
  });

  let globalHits = [];
  if (retrieval?.hybridRetrieve) {
    globalHits = await retrieval.hybridRetrieve('resilience assessment evidence', {
      namespaces: ['archive', 'report'],
      reportDate,
      scopeId: reportScopeId === 'national' ? null : reportScopeId,
      epistemicProfile,
      topKFinal: 20,
    });
  }

  const preliminaryFocus = COMPONENT_IDS.filter((id) => {
    const ep = epistemicProfile?.by_component?.[id] ?? {};
    return !ep.thin_evidence;
  });

  const componentHits = await seedComponentRagHits({
    retrieval,
    reportDate,
    scopeId: reportScopeId,
    epistemicProfile,
    focusComponents: preliminaryFocus.length ? preliminaryFocus : COMPONENT_IDS,
    signals,
    assessmentMode,
    epistemicStatus,
  });

  const hits = dedupeHits([globalHits, componentHits]);

  const evidenceGraph = buildEvidenceGraph({
    hits,
    signals,
    epistemicProfile,
    oovBurst,
    totalArticles,
  });

  const plannerContext = buildPlannerContext({
    epistemicProfile,
    evidenceGraph,
    oovBurst,
    assessmentMode,
  });

  const { plan, traceId: plannerTraceId } = await runPlannerAgent({
    epistemicProfile,
    plannerContext,
    llmPort,
    agentKernel: kernel,
    onUsage,
    budget,
  });

  let focusComponents = plan.focus_components ?? ['leadership'];
  const abstentionSet = new Set(plan.abstention_components ?? []);

  plannerContext.abstentionComponents = [...abstentionSet];
  if (plannerContext.exploration_candidates?.length && abstentionSet.size) {
    plannerContext.exploration_candidates = plannerContext.exploration_candidates.filter(
      (c) => !abstentionSet.has(c.component_id),
    );
  }

  if (budget.degradeMode === 'focus_top_3_components') {
    focusComponents = focusComponents.slice(0, 3);
  }

  const componentAssessments = [];
  const signalPool = scopedSignals ?? signals;

  function tasksForComponent(componentId) {
    return (plan.investigation_tasks ?? []).filter((t) => t.component_id === componentId);
  }

  function gapTasksForComponent(componentId) {
    return (plan.gap_closure_tasks ?? []).filter(
      (t) => t.component_id === componentId && !abstentionSet.has(componentId),
    );
  }

  async function assessComponent(componentId) {
    const raw = await runComponentSpecialist({
      componentId,
      epistemicProfile,
      evidenceGraph,
      multiHop,
      llmPort,
      agentKernel: kernel,
      onUsage,
      budget,
      abstain: abstentionSet.has(componentId),
      escalate: plan.investigation_tasks?.some((t) => t.component_id === componentId),
      traceId: plannerTraceId ?? traceId,
      reportDate,
      signals: signalPool,
      sourceArchive,
      evidenceStore,
      assignedTasks: tasksForComponent(componentId),
      gapClosureTasks: gapTasksForComponent(componentId),
    });

    let assessed = raw;
    const critic = runCriticChecks(assessed, epistemicProfile);
    if (critic.requiresRepair) {
      assessed = applyCriticRepair({ ...assessed }, critic.issues);
      const recheck = runCriticChecks(assessed, epistemicProfile);
      assessed.grounding_score = recheck.grounding_score;
    } else {
      assessed.grounding_score = critic.grounding_score;
    }
    return assessed;
  }

  const toRun = COMPONENT_IDS.filter((id) => {
    if (abstentionSet.has(id)) return true;
    if (focusComponents.length === 0) return true;
    return focusComponents.includes(id);
  });

  if (budget.degradeMode === 'focus_top_3_components') {
    const parallel = await Promise.all(
      toRun.slice(0, 3).map((id) => assessComponent(id)),
    );
    componentAssessments.push(...parallel);
    for (const id of COMPONENT_IDS.filter((cid) => !toRun.slice(0, 3).includes(cid))) {
      componentAssessments.push(await runComponentSpecialist({
        componentId: id,
        epistemicProfile,
        evidenceGraph,
        multiHop,
        llmPort,
        agentKernel: kernel,
        budget,
        abstain: true,
        traceId,
        reportDate,
        signals: signalPool,
        sourceArchive,
        evidenceStore,
      }));
    }
  } else {
    const parallel = await Promise.all(toRun.map((id) => assessComponent(id)));
    componentAssessments.push(...parallel);
    for (const id of COMPONENT_IDS.filter((cid) => !toRun.includes(cid))) {
      componentAssessments.push(await runComponentSpecialist({
        componentId: id,
        epistemicProfile,
        evidenceGraph,
        multiHop,
        llmPort,
        agentKernel: kernel,
        budget,
        abstain: true,
        traceId,
        reportDate,
        signals: signalPool,
        sourceArchive,
        evidenceStore,
      }));
    }
  }

  const v2Partial = createEmptyAssessmentV2({
    date: reportDate,
    report_scope_id: reportScopeId,
    assessment_mode: assessmentMode,
    agent_trace_id: traceId,
    epistemic_profile_ref: `epistemic-profile-${reportScopeId}-${reportDate}.json`,
    total_articles_analyzed: totalArticles,
    prompt_version: PROMPT_VERSION,
    model_card_ref: MODEL_CARD_REF,
  });
  v2Partial.components = componentAssessments;

  const synth = await runSynthesizerAgent({
    componentAssessments,
    epistemicProfile,
    llmPort,
    agentKernel: kernel,
    onUsage,
    budget,
    traceId,
    partialAssessment: v2Partial,
  });

  const assessmentV2 = {
    ...v2Partial,
    schema_version: ASSESSMENT_SCHEMA_VERSION,
    cross_component_synthesis: synth.cross_component_synthesis,
    attention_items: synth.attention_items,
    decision_brief: synth.decision_brief,
    retrieval_gaps: synth.retrieval_gaps,
    agent_trace_id: traceId,
    budget_snapshot: budget.snapshot(),
    investigation_plan: plan,
    planner_context: plannerContext,
    evidence_graph_summary: {
      component_count: Object.keys(evidenceGraph.by_component ?? {}).length,
      hit_count: hits.length,
      component_rag_hits: componentHits.length,
      oov_cluster_count: evidenceGraph.oov_cluster_count ?? 0,
    },
  };

  const validation = validateAssessmentV2(assessmentV2);
  if (!validation.valid) {
    assessmentV2.validation_warnings = validation.errors;
  }

  const legacy = mapAssessmentV2ToLegacy(assessmentV2, epistemicProfile, {
    dataVoid,
    epistemicStatus,
  });

  return {
    assessmentV2,
    assessment: legacy,
    traceId,
    budget: budget.snapshot(),
  };
}

export { runAssessmentAgent as default };
