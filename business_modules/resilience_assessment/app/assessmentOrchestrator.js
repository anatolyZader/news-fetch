/**
 * Main assessment agent orchestrator — planner → specialists → critic → synthesizer.
 */
import {
  createAgentKernel,
  createAgentBudgetGovernor,
  assessmentAgentMaxUsd,
  assessmentAgentMaxRounds,
  PROMPT_VERSION,
  MODEL_CARD_REF,
  archiveEpistemicEnabled,
  residualForAgentEnabled,
  openObsForAgentEnabled,
  investigationOovEnabled,
  crossComponentCheckEnabled,
} from '../../../cross-cut-modules/agent/index.js';
import { createMultiHopRetrieval } from '../../../cross-cut-modules/retrieval/multiHopRetrieval.js';
import { buildEvidenceGraph } from '../../../cross-cut-modules/retrieval/evidenceGraph.js';
import { seedComponentRagForComponents, seedComponentRagHits, dedupeHits } from '../../../cross-cut-modules/retrieval/componentRagSeeding.js';
import {
  assessLazyRagEnabled,
  assessGlobalRagEnabled,
  assessGlobalTopK,
} from '../../../cross-cut-modules/retrieval/ragConfig.js';
import { buildPlannerContext } from '../../../cross-cut-modules/retrieval/plannerContextBuilder.js';
import { computeArchiveMentionMass } from '../../../cross-cut-modules/retrieval/archiveEpistemicHints.js';
import { loadOpenObservationsForAgent, groupObservationsByComponent } from '../../../cross-cut-modules/retrieval/residualObservations.js';
import { enrichProfileForInvestigation } from '../../epistemic_features/index.js';
import { applyInvestigationSignalFlags } from '../../resilience/index.js';
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
import { applySynthesisOovChecks } from '../domain/services/synthesisOovChecks.js';
import { mapAssessmentV2ToLegacy } from '../domain/services/assessmentV2Mapper.js';
import { selectSpecialistComponents } from '../domain/services/componentSelectionPolicy.js';
import { resolveSpecialistTier } from '../domain/services/specialistTier.js';
import { detectCrossComponentContradictions } from '../domain/services/crossComponentConsistency.js';
import { needsReplan, buildReplanContext, affectedComponentsForReplan } from '../domain/services/replanPolicy.js';
import { evaluateInvestigationBurst } from '../../resilience/index.js';

async function loadInvestigationContext(params, reportDate) {
  let openObservations = [];
  if (openObsForAgentEnabled() || residualForAgentEnabled()) {
    openObservations = loadOpenObservationsForAgent(reportDate, {
      reportsDir: params.reportsDir ?? 'daily_reports',
      preRouted: params.openObservations ?? [],
    });
  }
  let investigationBurst = params.investigationOovBurst;
  if (!investigationBurst && investigationOovEnabled()) {
    investigationBurst = await evaluateInvestigationBurst(reportDate, {
      reportsDir: params.reportsDir ?? 'daily_reports',
    });
  }
  return {
    openObservations,
    residualObservations: openObservations,
    residualByComponent: groupObservationsByComponent(openObservations),
    investigationBurst,
  };
}

async function fetchAssessmentHits({
  retrieval,
  reportDate,
  reportScopeId,
  epistemicProfileBase,
  focusComponents,
  abstentionSet,
  signals,
  assessmentMode,
  epistemicStatus,
}) {
  let globalHits = [];
  if (assessGlobalRagEnabled() && retrieval?.hybridRetrieve) {
    globalHits = await retrieval.hybridRetrieve('resilience assessment evidence', {
      namespaces: ['archive', 'report'],
      reportDate,
      scopeId: reportScopeId === 'national' ? null : reportScopeId,
      epistemicProfile: epistemicProfileBase,
      topKFinal: assessGlobalTopK(),
    });
  }

  let componentHits;
  if (assessLazyRagEnabled()) {
    const lazyComponents = focusComponents.filter((id) => !abstentionSet.has(id));
    componentHits = await seedComponentRagForComponents({
      retrieval,
      reportDate,
      scopeId: reportScopeId,
      epistemicProfile: epistemicProfileBase,
      componentIds: lazyComponents,
      signals,
      assessmentMode,
      epistemicStatus,
    });
  } else {
    const preliminaryFocus = COMPONENT_IDS.filter((id) => {
      const ep = epistemicProfileBase?.by_component?.[id] ?? {};
      return !ep.thin_evidence;
    });
    componentHits = await seedComponentRagHits({
      retrieval,
      reportDate,
      scopeId: reportScopeId,
      epistemicProfile: epistemicProfileBase,
      focusComponents: preliminaryFocus.length ? preliminaryFocus : COMPONENT_IDS,
      signals,
      assessmentMode,
      epistemicStatus,
    });
  }
  return { hits: dedupeHits([globalHits, componentHits]), componentHits };
}

function createAbstainedSpecialistRunner({
  epistemicProfileEnriched,
  evidenceGraph,
  multiHop,
  llmPort,
  kernel,
  budget,
  traceId,
  reportDate,
  signalPool,
  sourceArchive,
  evidenceStore,
}) {
  return (componentId) => runComponentSpecialist({
    componentId,
    epistemicProfile: epistemicProfileEnriched,
    evidenceGraph,
    multiHop,
    llmPort,
    agentKernel: kernel,
    budget,
    abstain: true,
    specialistTier: 'C',
    traceId,
    reportDate,
    signals: signalPool,
    sourceArchive,
    evidenceStore,
  });
}

async function runAllComponentAssessments({
  toRun,
  budget,
  assessComponent,
  runAbstainedSpecialist,
}) {
  const componentAssessments = [];
  if (budget.degradeMode === 'focus_top_3_components') {
    const parallel = await Promise.all(toRun.slice(0, 3).map((id) => assessComponent(id)));
    componentAssessments.push(...parallel);
    const skipped = COMPONENT_IDS.filter((cid) => !toRun.slice(0, 3).includes(cid));
    for (const id of skipped) componentAssessments.push(await runAbstainedSpecialist(id));
    return componentAssessments;
  }
  const parallel = await Promise.all(toRun.map((id) => assessComponent(id)));
  componentAssessments.push(...parallel);
  const skipped = COMPONENT_IDS.filter((cid) => !toRun.includes(cid));
  for (const id of skipped) componentAssessments.push(await runAbstainedSpecialist(id));
  return componentAssessments;
}

async function maybeReplanAndRefresh({
  componentAssessments,
  crossComponentIssues,
  currentPlan,
  plannerContext,
  epistemicProfileEnriched,
  assessmentMode,
  llmPort,
  kernel,
  onUsage,
  budget,
  traceId,
  assessComponent,
}) {
  if (!needsReplan({ componentAssessments, crossComponentIssues, plan: currentPlan, plannerContext })) {
    return { currentPlan, plannerSource: currentPlan.planner_source ?? 'llm', crossComponentIssues };
  }
  const replanContext = buildReplanContext({ plannerContext, componentAssessments, crossComponentIssues });
  const replanResult = await runPlannerAgent({
    epistemicProfile: epistemicProfileEnriched,
    plannerContext: replanContext,
    assessmentMode,
    llmPort,
    agentKernel: kernel,
    onUsage,
    budget,
    traceId,
    forceLlm: true,
  });
  const previousPlan = currentPlan;
  const nextPlan = { ...replanResult.plan, planner_source: 'replan' };
  const affected = affectedComponentsForReplan(nextPlan, previousPlan, crossComponentIssues);
  for (const compId of affected) {
    const updated = await assessComponent(compId, nextPlan);
    const idx = componentAssessments.findIndex((a) => a.component_id === compId);
    if (idx >= 0) componentAssessments[idx] = updated;
    else componentAssessments.push(updated);
  }
  const refreshedIssues = crossComponentCheckEnabled()
    ? detectCrossComponentContradictions(componentAssessments)
    : crossComponentIssues;
  return { currentPlan: nextPlan, plannerSource: 'replan', crossComponentIssues: refreshedIssues };
}

function buildAssessmentV2Result({
  v2Partial,
  synth,
  traceId,
  budget,
  currentPlan,
  plannerContext,
  crossComponentIssues,
  epistemicProfileEnriched,
  evidenceGraph,
  hits,
  componentHits,
  residualObservations,
  plannerSource,
}) {
  const assessmentV2 = {
    ...v2Partial,
    schema_version: ASSESSMENT_SCHEMA_VERSION,
    cross_component_synthesis: synth.cross_component_synthesis,
    attention_items: synth.attention_items,
    decision_brief: synth.decision_brief,
    retrieval_gaps: synth.retrieval_gaps,
    synthesis_mode: synth.synthesis_mode ?? 'llm',
    agent_trace_id: traceId,
    budget_snapshot: budget.snapshot(),
    investigation_plan: currentPlan,
    planner_context: plannerContext,
    cross_component_issues: crossComponentIssues,
    investigation_enrichment: epistemicProfileEnriched.investigation_enrichment_applied === true,
    evidence_graph_summary: {
      component_count: Object.keys(evidenceGraph.by_component ?? {}).length,
      hit_count: hits.length,
      component_rag_hits: componentHits.length,
      oov_cluster_count: evidenceGraph.oov_cluster_count ?? 0,
      residual_observation_count: residualObservations.length,
      planner_source: plannerSource,
      synthesis_mode: synth.synthesis_mode ?? 'llm',
    },
  };
  const validation = validateAssessmentV2(assessmentV2);
  if (!validation.valid) assessmentV2.validation_warnings = validation.errors;
  return assessmentV2;
}

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

  const {
    openObservations,
    residualObservations,
    residualByComponent,
    investigationBurst,
  } = await loadInvestigationContext(params, reportDate);

  let epistemicProfileBase = enrichProfileForInvestigation(epistemicProfile, {
    archiveMentionMass: {},
    residualByComponent,
    investigationOovBurst: investigationBurst,
  });
  epistemicProfileBase = applyInvestigationSignalFlags(epistemicProfileBase, signals, dataVoid);

  const evidenceGraphInitial = buildEvidenceGraph({
    hits: [],
    signals,
    epistemicProfile: epistemicProfileBase,
    oovBurst: investigationBurst ?? oovBurst,
    totalArticles,
    openObservations,
    dataVoid,
  });

  const plannerContext = buildPlannerContext({
    epistemicProfile: epistemicProfileBase,
    evidenceGraph: evidenceGraphInitial,
    oovBurst,
    investigationOovBurst: investigationBurst,
    assessmentMode,
    archiveMentionMass: {},
    residualObservations,
  });

  const { plan, traceId: plannerTraceId } = await runPlannerAgent({
    epistemicProfile: epistemicProfileBase,
    plannerContext,
    assessmentMode,
    llmPort,
    agentKernel: kernel,
    onUsage,
    budget,
    traceId,
  });

  let focusComponents = plan.focus_components ?? ['leadership'];
  const abstentionSet = new Set(plan.abstention_components ?? []);

  const { hits, componentHits } = await fetchAssessmentHits({
    retrieval,
    reportDate,
    reportScopeId,
    epistemicProfileBase,
    focusComponents,
    abstentionSet,
    signals,
    assessmentMode,
    epistemicStatus,
  });
  const archiveMentionMass = archiveEpistemicEnabled()
    ? computeArchiveMentionMass(hits)
    : {};

  let epistemicProfileEnriched = enrichProfileForInvestigation(epistemicProfile, {
    archiveMentionMass,
    residualByComponent,
    investigationOovBurst: investigationBurst,
  });
  epistemicProfileEnriched = applyInvestigationSignalFlags(epistemicProfileEnriched, signals, dataVoid);

  const evidenceGraph = buildEvidenceGraph({
    hits,
    signals,
    epistemicProfile: epistemicProfileEnriched,
    oovBurst: investigationBurst ?? oovBurst,
    totalArticles,
    openObservations,
    dataVoid,
  });

  plannerContext.abstentionComponents = [...abstentionSet];
  if (plannerContext.exploration_candidates?.length && abstentionSet.size) {
    plannerContext.exploration_candidates = plannerContext.exploration_candidates.filter(
      (c) => !abstentionSet.has(c.component_id),
    );
  }

  if (budget.degradeMode === 'focus_top_3_components') {
    focusComponents = focusComponents.slice(0, 3);
  }

  let currentPlan = plan;
  let plannerSource;

  const signalPool = scopedSignals ?? signals;

  function tasksForComponent(componentId, activePlan = currentPlan) {
    return (activePlan.investigation_tasks ?? []).filter((t) => t.component_id === componentId);
  }

  function gapTasksForComponent(componentId, activePlan = currentPlan) {
    return (activePlan.gap_closure_tasks ?? []).filter(
      (t) => t.component_id === componentId && !abstentionSet.has(componentId),
    );
  }

  async function assessComponent(componentId, activePlan = currentPlan) {
    const assignedTasks = tasksForComponent(componentId, activePlan);
    const gapClosureTasks = gapTasksForComponent(componentId, activePlan);
    const abstain = (activePlan.abstention_components ?? []).includes(componentId);
    const tier = resolveSpecialistTier({
      componentId,
      epistemicProfile: epistemicProfileEnriched,
      plannerContext,
      plan: activePlan,
      abstain,
      escalate: activePlan.investigation_tasks?.some((t) => t.component_id === componentId),
      evidenceGraph,
      gapClosureTasks,
      assignedTasks,
    });

    const raw = await runComponentSpecialist({
      componentId,
      epistemicProfile: epistemicProfileEnriched,
      evidenceGraph,
      multiHop,
      llmPort,
      agentKernel: kernel,
      onUsage,
      budget,
      abstain,
      specialistTier: tier,
      escalate: tier === 'A',
      traceId: plannerTraceId ?? traceId,
      reportDate,
      signals: signalPool,
      sourceArchive,
      evidenceStore,
      assignedTasks,
      gapClosureTasks,
    });

    let assessed = raw;
    const critic = runCriticChecks(assessed, epistemicProfileEnriched);
    if (critic.requiresRepair) {
      assessed = applyCriticRepair({ ...assessed }, critic.issues);
      const recheck = runCriticChecks(assessed, epistemicProfileEnriched);
      assessed.grounding_score = recheck.grounding_score;
    } else {
      assessed.grounding_score = critic.grounding_score;
    }
    return assessed;
  }

  const toRun = selectSpecialistComponents({
    abstentionSet,
    focusComponents,
    epistemicProfileEnriched,
  });

  const runAbstainedSpecialist = createAbstainedSpecialistRunner({
    epistemicProfileEnriched,
    evidenceGraph,
    multiHop,
    llmPort,
    kernel,
    budget,
    traceId,
    reportDate,
    signalPool,
    sourceArchive,
    evidenceStore,
  });
  const componentAssessments = await runAllComponentAssessments({
    toRun,
    budget,
    assessComponent,
    runAbstainedSpecialist,
  });

  let crossComponentIssues = crossComponentCheckEnabled()
    ? detectCrossComponentContradictions(componentAssessments)
    : [];
  const replanResult = await maybeReplanAndRefresh({
    componentAssessments,
    crossComponentIssues,
    currentPlan,
    plannerContext,
    epistemicProfileEnriched,
    assessmentMode,
    llmPort,
    kernel,
    onUsage,
    budget,
    traceId,
    assessComponent,
  });
  currentPlan = replanResult.currentPlan;
  plannerSource = replanResult.plannerSource;
  crossComponentIssues = replanResult.crossComponentIssues;

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

  const openObservationClaims = collectOpenObservationClaims(evidenceGraph);

  const synthRaw = await runSynthesizerAgent({
    componentAssessments,
    epistemicProfile: epistemicProfileEnriched,
    llmPort,
    agentKernel: kernel,
    onUsage,
    budget,
    traceId,
    partialAssessment: v2Partial,
    oovClusters: evidenceGraph.nodes?.oov_clusters ?? [],
    openObservationClaims,
    assessmentMode,
  });

  const synth = applySynthesisOovChecks(synthRaw, {
    oovClusters: evidenceGraph.nodes?.oov_clusters ?? [],
    openObservationClaims,
    componentAssessments,
  });

  const assessmentV2 = buildAssessmentV2Result({
    v2Partial,
    synth,
    traceId,
    budget,
    currentPlan,
    plannerContext,
    crossComponentIssues,
    epistemicProfileEnriched,
    evidenceGraph,
    hits,
    componentHits,
    residualObservations,
    plannerSource,
  });

  const legacy = mapAssessmentV2ToLegacy(assessmentV2, epistemicProfile, {
    dataVoid,
    epistemicStatus,
  });

  return {
    assessmentV2,
    assessment: legacy,
    traceId,
    budget: budget.snapshot(),
    evidenceGraph,
  };
}

function collectOpenObservationClaims(evidenceGraph) {
  const out = [];
  for (const [componentId, graph] of Object.entries(evidenceGraph?.by_component ?? {})) {
    for (const claim of graph.claims ?? []) {
      const flags = claim.epistemic_flags ?? [];
      if (flags.includes('open_observation') || flags.includes('residual_observation')) {
        out.push({
          component_id: componentId,
          claim_id: claim.claim_id,
          text: claim.text,
          observation_id: claim.observation_id ?? null,
          epistemic_flags: flags,
        });
      }
    }
  }
  return out;
}

export default runAssessmentAgent;

