/**
 * Option B pipeline: agent v2 primary + legacy shadow scoring/narratives.
 */
import {
  assessmentAgentEnabled,
  shadowScoringEnabled,
  shadowNarrativesEnabled,
} from '../../../cross-cut-modules/agent/index.js';
import { getDefaultLlmPort } from '../../../cross-cut-modules/llm/anthropicLlmAdapter.js';
import { createEpistemicFeaturesService } from '../../epistemic_features/index.js';
import {
  runAssessmentAgent,
  computeDivergence,
  writeShadowArtifacts,
} from '../../resilience_assessment/index.js';
import { generateNarratives } from '../infrastructure/claudeEvaluator.js';

/**
 * @param {object} params — assess-signals finalize context
 * @returns {Promise<object>} assessment (legacy-compatible, from agent or narratives)
 */
export async function produceAssessmentWithShadow(params) {
  const {
    targetDate,
    reportScopeId,
    signalsForScoring,
    scopedSignals,
    scoredFull,
    scopedTotalArticles,
    dataVoid,
    assessmentMode,
    epistemicStatus,
    retrievalService,
    onUsage,
    reportsDir = 'daily_reports',
    legacyNarrativeOpts = {},
  } = params;

  if (!assessmentAgentEnabled()) {
    return generateNarratives(scoredFull, signalsForScoring, targetDate, scopedTotalArticles, {
      onUsage,
      ...legacyNarrativeOpts,
      dataVoid,
      retrievalService,
    });
  }

  const epistemicService = createEpistemicFeaturesService({ reportsDir });
  const historicalMass = buildHistoricalMassMap(scoredFull);
  const epistemicProfile = epistemicService.computeProfile(signalsForScoring, {
    totalArticles: scopedTotalArticles,
    reportDate: targetDate,
    assessmentEpistemic: { assessment_mode: assessmentMode, epistemic_status: epistemicStatus },
    historicalMass,
    scoredComponents: scoredFull,
  });
  epistemicService.persistProfile(epistemicProfile, { scopeId: reportScopeId, date: targetDate });

  const llmPort = getDefaultLlmPort();
  const { assessment, assessmentV2, traceId } = await runAssessmentAgent({
    signals: signalsForScoring,
    epistemicProfile,
    retrievalService,
    reportDate: targetDate,
    reportScopeId,
    totalArticles: scopedTotalArticles,
    assessmentMode,
    llmPort,
    onUsage,
    dataVoid,
    epistemicStatus,
    reportsDir,
    sourceArchive: params.sourceArchive ?? null,
    evidenceStore: params.evidenceStore ?? null,
    scopedSignals: scopedSignals ?? signalsForScoring,
    oovBurst: params.oovBurst ?? null,
  });

  assessment.schema_version = assessmentV2.schema_version;
  assessment.agent_trace_id = traceId;
  assessment.epistemic_profile_ref = epistemicProfile.report_date
    ? `epistemic-profile-${reportScopeId}-${targetDate}.json`
    : null;
  assessment.investigation_plan = assessmentV2.investigation_plan;
  assessment.retrieval_gaps = assessmentV2.retrieval_gaps;
  assessment.budget_snapshot = assessmentV2.budget_snapshot;

  if (shadowScoringEnabled() && scoredFull) {
    let shadowNarratives = null;
    if (shadowNarrativesEnabled()) {
      try {
        shadowNarratives = await generateNarratives(
          scoredFull,
          signalsForScoring,
          targetDate,
          scopedTotalArticles,
          { onUsage, ...legacyNarrativeOpts, dataVoid, retrievalService },
        );
      } catch (err) {
        console.error(`[assess-signals] shadow narratives skipped: ${err.message}`);
      }
    }
    const divergence = computeDivergence(assessment, scoredFull);
    writeShadowArtifacts({
      reportsDir,
      scopeId: reportScopeId,
      date: targetDate,
      shadowScored: scoredFull,
      shadowNarratives,
      divergence,
    });
    assessment.shadow_divergence = divergence;
  }

  return assessment;
}

function buildHistoricalMassMap(scoredFull) {
  const out = {};
  for (const [id, c] of Object.entries(scoredFull ?? {})) {
    out[id] = [c.evidence_mass ?? 0];
  }
  return out;
}
