/**
 * Assessment agent orchestrator: planner → specialists → critic → synthesizer → legacy map.
 *
 * **Owns:** multi-agent investigation loop, RAG seeding, evidence graph construction, replan
 * policy, budget governance, and v2→legacy assessment mapping.
 *
 * **Pipeline position:** invoked from `produceAssessment.tryAssessmentAgent` during Stage-2 when
 * closed-core / rich-deterministic / budget-skip paths are not selected.
 *
 * **Inputs:** investigation signal pool, frozen epistemic profile, retrieval/sourceArchive ports,
 * report date/scope, dataVoid, open observations, OOV burst context.
 *
 * **Outputs:** `{ assessmentV2, assessment, traceId, budget, evidenceGraph }`.
 *
 * **Does NOT:** extract signals, load bundles, write report files, or emit numeric 1–10 scores.
 *
 * **Collaborators:** `plannerAgent`, `componentSpecialistAgent`, `criticAgent`, `synthesizerAgent`,
 * `cross-cut-modules/retrieval`, `cross-cut-modules/agent` (kernel, budget).
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
import { enrichProfileForInvestigation } from '../domain/services/investigationEpistemic.js';
import { applyInvestigationSignalFlags, buildNorthClusterNarrativesFromSignals } from '../../resilience_scorer/index.js';
import {
  ASSESSMENT_SCHEMA_VERSION,
  createEmptyAssessmentV2,
  validateAssessmentV2,
} from '../../resilience_scorer/index.js';
import { COMPONENT_IDS } from '../../resilience_scorer/index.js';
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
import { evaluateInvestigationBurst } from '../../resilience_scorer/index.js';
import { resilienceCapturesDir, resilienceReportsDir } from '../domain/services/artifactPaths.js';

/** Load open/residual observations and optional investigation OOV burst for planner context. */
async function loadInvestigationContext(params, reportDate) {
  let openObservations = [];
  if (openObsForAgentEnabled() || residualForAgentEnabled()) {
    openObservations = loadOpenObservationsForAgent(reportDate, {
      capturesDir: params.capturesDir ?? resilienceCapturesDir(),
      preRouted: params.openObservations ?? [],
    });
  }
  let investigationBurst = params.investigationOovBurst;
  if (!investigationBurst && investigationOovEnabled()) {
    investigationBurst = await evaluateInvestigationBurst(reportDate, {
      capturesDir: params.capturesDir ?? resilienceCapturesDir(),
    });
  }
  return {
    openObservations,
    residualObservations: openObservations,
    residualByComponent: groupObservationsByComponent(openObservations),
    investigationBurst,
  };
}

/** Global + per-component RAG seeding before evidence graph build (lazy or eager policy). */
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

/** Factory for tier-C abstention specialists on components skipped by budget/selection. */
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

/** Run focus components (parallel); under budget degrade, cap at top 3 + abstain rest. */
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

/** Optional replan round when critic/cross-component checks trigger replanPolicy. */
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

/** Assemble validated assessment v2 payload from synthesizer output and run metadata. */
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
 * Run full assessment agent pipeline for one report date/scope.
 *
 * @param {object} params
 * @param {object[]} params.signals — investigation/scoring signal pool
 * @param {object} params.epistemicProfile — frozen count-based profile from resilience_scorer
 * @param {string} params.reportDate
 * @param {string} [params.reportScopeId='national']
 * @param {import('../../resilience_scorer/domain/ports/IResilienceLlmPort.js').IResilienceLlmPort} params.llmPort
 * @returns {Promise<{ assessmentV2: object, assessment: object, traceId: string, budget: object, evidenceGraph: object }>}
 * @sideEffects LLM tool rounds across planner/specialists/synthesizer; RAG retrieval calls
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
    narrativeScopeSignals = null,
    oovBurst = null,
  } = params;

  const narrativePool = narrativeScopeSignals ?? scopedSignals ?? signals;

  const budget = createAgentBudgetGovernor({
    maxUsd: assessmentAgentMaxUsd(),
    maxToolRounds: assessmentAgentMaxRounds(),
  });
  const kernel = agentKernel ?? createAgentKernel({ llmPort });
  const traceId = `${reportScopeId}-${reportDate}-${Date.now().toString(36)}`;

  const retrieval = retrievalService?.retrieval ?? null;
  const multiHop = createMultiHopRetrieval({
    retrieval,
    reportsDir: params.reportsDir ?? resilienceReportsDir(),
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
    signals: narrativePool,
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
    epistemicProfile: epistemicProfileBase,
    focusComponents,
    abstentionSet,
    signals: narrativePool,
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
    signals: narrativePool,
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

  const signalPool = narrativePool;

  const clusterSummaries = reportScopeId === 'north'
    ? buildNorthClusterNarrativesFromSignals(narrativePool)
    : null;

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
      reportScopeId,
      totalScopedSignals: (scopedSignals ?? signals ?? []).length,
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
    let verdict = runCriticChecks(assessed, epistemicProfileEnriched);
    if (verdict.requiresRepair) {
      assessed = applyCriticRepair({ ...assessed }, verdict.issues);
      verdict = runCriticChecks(assessed, epistemicProfileEnriched);
    }
    assessed.grounding_score = verdict.grounding_score;
    assessed.critic_passed = verdict.passed;
    if (!verdict.passed && assessed.confidence === 'high') {
      assessed.confidence = 'medium';
      assessed.repair_log = [
        ...(assessed.repair_log ?? []),
        { issue: 'critic_failed', action: 'downgraded_confidence' },
      ];
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
    clusterSummaries,
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

/** Collect open/residual observation claims from evidence graph for synthesizer prompt. */
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

