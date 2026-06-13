/**
 * Agent v2 primary assess + shadow scoring; deterministic degrade ladder on failure.
 */
import {
  shadowScoringEnabled,
  shouldSkipAssessmentAgent,
} from '../../../cross-cut-modules/agent/index.js';
import { getDefaultLlmPort } from '../../../cross-cut-modules/llm/anthropicLlmAdapter.js';
import { createEpistemicFeaturesService, loadHistoricalEpistemicMass } from '../../epistemic_features/index.js';
import {
  runAssessmentAgent,
  runDeterministicAssessment,
  loadCachedAssessmentFallback,
} from '../../resilience_assessment/index.js';
import {
  computeDivergence,
  writeShadowArtifacts,
} from './shadowFacade.js';

/**
 * @param {object} params — assess-signals finalize context
 * @returns {Promise<object>} assessment (legacy-compatible from agent or degrade ladder)
 */
export async function produceAssessmentWithShadow(params) {
  const epistemicProfile = buildEpistemicProfile(params);
  const agentOutcome = await resolveAssessmentOutcome(params, epistemicProfile);
  attachAssessmentV2Fields(agentOutcome.assessment, agentOutcome.assessmentV2, {
    epistemicProfile,
    reportScopeId: params.reportScopeId,
    targetDate: params.targetDate,
    traceId: agentOutcome.traceId,
  });
  attachShadowDivergence(agentOutcome.assessment, params);
  return agentOutcome.assessment;
}

export function attachShadowDivergenceToAssessment(assessment, params) {
  attachShadowDivergence(assessment, params);
}

function resolveInvestigationSignals(params) {
  return params.investigationSignals ?? params.signalsForScoring ?? [];
}

function buildEpistemicProfile(params) {
  const investigationSignals = resolveInvestigationSignals(params);
  const epistemicService = createEpistemicFeaturesService({ reportsDir: params.reportsDir ?? 'daily_reports' });
  const historicalMass = loadHistoricalEpistemicMass(
    params.targetDate,
    params.reportsDir ?? 'daily_reports',
    14,
    params.reportScopeId,
  );
  const investigationEpistemic = params.investigationEpistemic ?? {};
  const epistemicProfile = epistemicService.computeProfile(investigationSignals, {
    totalArticles: params.scopedTotalArticles,
    reportDate: params.targetDate,
    mediaSignals: params.scopedSignals ?? investigationSignals,
    assessmentEpistemic: {
      assessment_mode: investigationEpistemic.assessmentMode ?? params.assessmentMode ?? 'normal',
      epistemic_status: investigationEpistemic.epistemicStatus ?? params.epistemicStatus,
      investigation_mode: investigationEpistemic.investigationMode ?? null,
    },
    historicalMass,
  });
  epistemicService.persistProfile(epistemicProfile, {
    scopeId: params.reportScopeId,
    date: params.targetDate,
  });
  return epistemicProfile;
}

async function resolveAssessmentOutcome(params, epistemicProfile) {
  const agentAttempt = await tryAssessmentAgent(params, epistemicProfile);
  if (agentAttempt.assessment) {
    attachAgentInternals(agentAttempt.assessment, agentAttempt);
    return agentAttempt;
  }
  return resolveDegradedAssessment(params, epistemicProfile, agentAttempt.degradeReason);
}

function attachAgentInternals(assessment, agentOutcome) {
  if (agentOutcome.assessmentV2?.components) {
    assessment._agent_components = agentOutcome.assessmentV2.components;
  }
  if (agentOutcome.evidenceGraph) {
    assessment._evidence_graph = agentOutcome.evidenceGraph;
  }
}

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
      reportsDir: params.reportsDir ?? 'daily_reports',
      sourceArchive: params.sourceArchive ?? null,
      evidenceStore: params.evidenceStore ?? null,
      scopedSignals: params.scopedSignals ?? investigationSignals,
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
    reportsDir: params.reportsDir ?? 'daily_reports',
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

function attachShadowDivergence(assessment, params) {
  if (!shadowScoringEnabled() || !params.scoredFull) return;
  const reportsDir = params.reportsDir ?? 'daily_reports';
  const divergence = computeDivergence(assessment, params.scoredFull);
  writeShadowArtifacts({
    reportsDir,
    scopeId: params.reportScopeId,
    date: params.targetDate,
    shadowScored: params.scoredFull,
    divergence,
  });
  assessment.shadow_divergence = divergence;
}

function resolveForceDeterministicReason() {
  if (process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC === '1'
    || process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC === 'true') {
    return 'forced_deterministic';
  }
  return 'legacy_flag_deprecated';
}
