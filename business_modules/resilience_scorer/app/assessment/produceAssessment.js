/**
 * Assessment producer: agent v2 primary path with deterministic degrade ladder.
 *
 * **Owns:** epistemic profile computation/persist, assessment agent invocation, degrade
 * fallbacks (deterministic assess → cached report), and v2 metadata attachment on legacy assessment.
 *
 * **Pipeline position:** Stage-2 narrate branch inside `assessmentStageRunner` when closed-core
 * and rich-deterministic modes are disabled.
 *
 * **Inputs:** scoped investigation signals, evidence pipeline outputs (`scoredFull`, dataVoid),
 * retrieval/sourceArchive/evidenceStore ports, budget flags.
 *
 * **Outputs:** legacy-compatible `assessment` object (may include `_agent_components`, `_evidence_graph`).
 *
 * **Does NOT:** run evidence partition itself, write final report files, or compute numeric scores.
 *
 * **Collaborators:** `specialist_agents` (`runAssessmentAgent`, `runDeterministicAssessment`),
 * `epistemicFeaturesService`, `cross-cut-modules/agent` (skip/budget gates).
 */
import {
  shouldSkipAssessmentAgent,
  isClosedCoreAssessEnabled,
} from '../../../../cross-cut-modules/agent/index.js';
import { getDefaultLlmPort } from '../../../../cross-cut-modules/llm/anthropicLlmAdapter.js';
import { createEpistemicFeaturesService } from './epistemicFeaturesService.js';
import {
  runAssessmentAgent,
  runDeterministicAssessment,
  loadCachedAssessmentFallback,
} from '../../../specialist_agents/index.js';
import { resilienceReportsDir } from '../../domain/services/paths/outputDirs.js';

function resolveReportsDir(params) {
  return params.reportsDir ?? resilienceReportsDir();
}

/**
 * Produce assessment via agent or degrade ladder; attach v2 cross-references.
 *
 * @param {object} params — assess-signals finalize context (signals, epistemic, ports, dates)
 * @returns {Promise<object>} legacy-compatible assessment object
 * @sideEffects LLM agent calls; persists epistemic profile; may read cached report from disk
 */
export async function produceAssessment(params) {
  const epistemicProfile = buildEpistemicProfile(params);
  const agentOutcome = await resolveAssessmentOutcome(params, epistemicProfile);
  attachAssessmentV2Fields(agentOutcome.assessment, agentOutcome.assessmentV2, {
    epistemicProfile,
    reportScopeId: params.reportScopeId,
    targetDate: params.targetDate,
    traceId: agentOutcome.traceId,
  });
  return agentOutcome.assessment;
}

/** Prefer explicit investigation pool over metrics-only scoring set. */
function resolveInvestigationSignals(params) {
  return params.investigationSignals ?? params.signalsForScoring ?? [];
}

/** Compute and persist epistemic profile for the investigation signal pool. */
function buildEpistemicProfile(params) {
  const investigationSignals = resolveInvestigationSignals(params);
  const epistemicService = createEpistemicFeaturesService({});
  const investigationEpistemic = params.investigationEpistemic ?? {};
  const epistemicProfile = epistemicService.computeProfile(investigationSignals, {
    totalArticles: params.scopedTotalArticles,
    reportDate: params.targetDate,
    mediaSignals: params.scopedSignals ?? investigationSignals,
    componentEvidence: params.componentEvidence ?? null,
    exposureContext: params.exposureContext ?? null,
    trajectories: params.trajectoryContext?.by_component ?? null,
    assessmentEpistemic: {
      assessment_mode: investigationEpistemic.assessmentMode ?? params.assessmentMode ?? 'normal',
      epistemic_status: investigationEpistemic.epistemicStatus ?? params.epistemicStatus,
      investigation_mode: investigationEpistemic.investigationMode ?? null,
    },
  });
  epistemicService.persistProfile(epistemicProfile, {
    scopeId: params.reportScopeId,
    date: params.targetDate,
  });
  return epistemicProfile;
}

/** Agent first; on skip/failure run deterministic assess then cached fallback. */
async function resolveAssessmentOutcome(params, epistemicProfile) {
  const agentAttempt = await tryAssessmentAgent(params, epistemicProfile);
  if (agentAttempt.assessment) {
    attachAgentInternals(agentAttempt.assessment, agentAttempt);
    return agentAttempt;
  }
  return resolveDegradedAssessment(params, epistemicProfile, agentAttempt.degradeReason);
}

/** Stash agent internals on legacy assessment for downstream diagnostics. */
function attachAgentInternals(assessment, agentOutcome) {
  if (agentOutcome.assessmentV2?.components) {
    assessment._agent_components = agentOutcome.assessmentV2.components;
  }
  if (agentOutcome.evidenceGraph) {
    assessment._evidence_graph = agentOutcome.evidenceGraph;
  }
}

/** Invoke specialist assessment agent unless budget/env forces deterministic skip. */
async function tryAssessmentAgent(params, epistemicProfile) {
  const skipAgent = shouldSkipAssessmentAgent({ dailyBudgetExceeded: params.dailyBudgetExceeded });
  if (skipAgent) {
    const degradeReason = params.dailyBudgetExceeded ? 'budget_exceeded' : resolveForceDeterministicReason();
    console.error(`[assess-signals] Skipping assessment agent (${degradeReason}); using deterministic degrade.`);
    return { assessment: null, assessmentV2: null, traceId: null, degradeReason };
  }

  const llmPortForAgent = params.llmPort ?? getDefaultLlmPort();
  const investigationSignals = resolveInvestigationSignals(params);
  const investigationEpistemic = params.investigationEpistemic ?? {};
  try {
    const agentResult = await runAssessmentAgent({
      signals: investigationSignals,
      epistemicProfile,
      retrievalService: params.retrievalService,
      reportDate: params.targetDate,
      reportScopeId: params.reportScopeId,
      totalArticles: params.scopedTotalArticles,
      assessmentMode: investigationEpistemic.assessmentMode ?? params.assessmentMode ?? 'normal',
      llmPort: llmPortForAgent,
      onUsage: params.onUsage,
      dataVoid: params.dataVoid,
      epistemicStatus: investigationEpistemic.epistemicStatus ?? params.epistemicStatus,
      reportsDir: resolveReportsDir(params),
      sourceArchive: params.sourceArchive ?? null,
      evidenceStore: params.evidenceStore ?? null,
      scopedSignals: params.scopedSignals ?? investigationSignals,
      narrativeScopeSignals: params.narrativeScopeSignals ?? params.scopedSignals ?? investigationSignals,
      oovBurst: params.oovBurst ?? null,
      openObservations: params.openObservations ?? [],
    });
    return {
      assessment: agentResult.assessment,
      assessmentV2: agentResult.assessmentV2,
      traceId: agentResult.traceId,
      evidenceGraph: agentResult.evidenceGraph ?? null,
      degradeReason: null,
    };
  } catch (err) {
    console.error(`[assess-signals] Assessment agent failed (${err.message}); using deterministic degrade.`);
    return { assessment: null, assessmentV2: null, traceId: null, degradeReason: 'agent_failed' };
  }
}

/** Deterministic template assess, then optional cached report from prior date. */
async function resolveDegradedAssessment(params, epistemicProfile, degradeReason) {
  const investigationSignals = resolveInvestigationSignals(params);
  const investigationEpistemic = params.investigationEpistemic ?? {};
  const det = await runDeterministicAssessment({
    signals: investigationSignals,
    epistemicProfile,
    reportDate: params.targetDate,
    reportScopeId: params.reportScopeId,
    totalArticles: params.scopedTotalArticles,
    assessmentMode: 'degraded',
    dataVoid: params.dataVoid,
    epistemicStatus: investigationEpistemic.epistemicStatus ?? params.epistemicStatus,
    oovBurst: params.oovBurst ?? null,
    degradeReason: degradeReason ?? 'agent_failed',
  });

  if (!det.isEmpty && det.assessment) {
    return {
      assessment: det.assessment,
      assessmentV2: det.assessmentV2,
      traceId: det.traceId,
      degradeReason: null,
    };
  }

  const cached = loadCachedAssessmentFallback({
    targetDate: params.targetDate,
    reportScopeId: params.reportScopeId,
    reportsDir: resolveReportsDir(params),
    degradeReason: degradeReason ?? 'empty_signals',
  });
  if (cached?.assessment) {
    console.error(
      `[assess-signals] Using cached assessment from ${cached.cachedDate} (${cached.reportPath}).`,
    );
    return { assessment: cached.assessment, assessmentV2: null, traceId: null, degradeReason: null };
  }

  throw new Error(
    'Assessment agent unavailable and no deterministic or cached fallback exists for this scope/date.',
  );
}

/** Copy assessment v2 schema refs onto legacy assessment when agent succeeded. */
function attachAssessmentV2Fields(assessment, assessmentV2, { epistemicProfile, reportScopeId, targetDate, traceId }) {
  if (!assessmentV2) return;
  assessment.schema_version = assessmentV2.schema_version;
  assessment.agent_trace_id = traceId;
  assessment.epistemic_profile_ref = epistemicProfile.report_date
    ? `epistemic-profile-${reportScopeId}-${targetDate}.json`
    : null;
  assessment.investigation_plan = assessmentV2.investigation_plan;
  assessment.retrieval_gaps = assessmentV2.retrieval_gaps;
  assessment.budget_snapshot = assessmentV2.budget_snapshot;
}

/** Map env flags to human-readable skip reason for agent bypass logging. */
function resolveForceDeterministicReason() {
  if (process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC === '1'
    || process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC === 'true') {
    return 'forced_deterministic';
  }
  if (isClosedCoreAssessEnabled()) {
    return 'closed_core_assess';
  }
  return 'legacy_flag_deprecated';
}
