/**
 * Shared post-extraction assessment: scope → investigate → score → narrate → post-metadata.
 * Used by assess-signals CLI and runResilienceAssessment (score before narrate).
 */
import { scopeAndPartitionSignals } from './assessmentPipeline.js';
import { prepareInvestigationSignals } from './prepareInvestigationSignals.js';
import { prepareScoringSignals } from './prepareScoringSignals.js';
import { runScoringPipeline } from './scoringPipelinePrep.js';
import { deriveInvestigationEpistemicContext } from '../domain/services/investigationEpistemicContext.js';
import { salienceContextFromDataVoid } from '../domain/services/highSalienceBypass.js';
import { attachEpistemicToAssessment } from '../domain/services/dataVoidIndex.js';
import { detectSemanticPatterns } from '../domain/services/patternDetection/semanticPatternAlerts.js';
import { buildOperatorRecommendations } from '../domain/services/patternDetection/operatorRecommendations.js';
import { narrativeFocusUiEnabled } from '../../../cross-cut-modules/resilience-contracts/narrativeFocusUi.js';
import { attachInvestigationDiagnostics } from '../domain/services/componentDiagnostics.js';
import { countAndLogDefaultNorthSignals } from '../domain/services/scopeAttributionMetrics.js';
import {
  getSocialQuarantineDecision,
} from '../domain/services/socialQuarantineOverrides.js';
import { tryOpenValidationStore } from './socialQuarantineWiring.js';
import { summarizeValidationMaturity } from '../validation/domain/validationStatus.js';
import { ISRAEL_NATIONAL_DISTRICT_ID } from '../../../cross-cut-modules/geo/israelDistricts.js';
import {
  produceAssessmentWithShadow,
} from './produceAssessmentWithShadow.js';
import { attachDecisionBrief } from './attachDecisionBrief.js';
import { loadHistoricalScores } from './assessSignalsHelpers.js';

/**
 * @param {object} assessment
 * @param {object} ctx
 */
export function applySharedAssessmentPostMetadata(assessment, ctx) {
  const {
    investigationEpistemic,
    investigationPrep,
    pipelineResult,
    reportScopeId,
    reportDate,
    scopedSignals,
    signalsForScoring,
    scoredFull,
  } = ctx;

  attachEpistemicToAssessment(assessment, {
    dataVoid: investigationPrep.dataVoid,
    epistemicStatus: investigationEpistemic.epistemicStatus,
    assessmentMode: investigationEpistemic.assessmentMode,
    staleDigitalScores: pipelineResult?.staleDigitalScores ?? null,
    quarantinedDigital: pipelineResult?.quarantinedDigital ?? null,
    digitalQuarantineState: pipelineResult?.digitalQuarantineState ?? null,
  });

  if (pipelineResult) {
    assessment.shadow_scoring = {
      assessment_mode: pipelineResult.assessmentMode,
      epistemic_status: pipelineResult.epistemicStatus,
    };
    if (pipelineResult.epistemicEnrichment?.overall_score_calibrated != null) {
      assessment.overall_score_calibrated = pipelineResult.epistemicEnrichment.overall_score_calibrated;
    }
  }

  assessment.oov_burst = investigationPrep.oovBurst ?? null;
  if (ctx.oovScoringApplied) {
    assessment.oov_scoring_applied = ctx.oovScoringApplied;
  }
  if (ctx.openObservationsSummary) {
    assessment.open_observations_summary = ctx.openObservationsSummary;
  }
  if (ctx.openEvidenceScoringApplied) {
    assessment.open_evidence_scoring_applied = ctx.openEvidenceScoringApplied;
  }
  if (investigationPrep.osintChannelQuarantine) {
    const decision = investigationPrep.osintChannelQuarantine.active
      ? getSocialQuarantineDecision(reportDate, reportScopeId, tryOpenValidationStore())
      : null;
    assessment.social_channel_quarantine = {
      ...investigationPrep.osintChannelQuarantine,
      ...(decision?.created_at ? { confirmed_at: decision.created_at } : {}),
    };
  }

  const patterns = detectSemanticPatterns(scopedSignals ?? []);
  assessment.pattern_alerts = patterns;
  countAndLogDefaultNorthSignals(scopedSignals, { assessment });
  if (!narrativeFocusUiEnabled()) {
    assessment.operator_recommendations = buildOperatorRecommendations(patterns);
  }

  attachInvestigationDiagnostics(assessment, {
    scoring: {
      investigationSignals: investigationPrep.investigationSignals,
      signalsForScoring: signalsForScoring ?? investigationPrep.investigationSignals,
      scopedSignals,
      macroSignals: ctx.macroSignals ?? [],
      scoredFull: scoredFull ?? null,
      scoringPartition: pipelineResult?.partition ?? null,
      scoringAssessmentMode: pipelineResult?.assessmentMode ?? null,
      assessmentMode: investigationEpistemic.assessmentMode,
    },
    investigationPlan: assessment.investigation_plan,
  });
}

/**
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function runPostExtractionAssessmentCore(params) {
  const {
    allSignals,
    reportScopeId,
    reportDate,
    totalArticles,
    reportsDir = 'daily_reports',
    historicalScores: historicalScoresIn,
    onUsage,
    retrievalService = null,
    sourceArchive = null,
    evidenceStore = null,
    llmPort = null,
    dailyBudgetExceeded = false,
    openObservations = [],
    rootDir = process.cwd(),
    openObservationsSummary = null,
    onScoreComplete,
    onNarrateComplete,
    attachDecisionBrief: shouldAttachBrief = true,
  } = params;

  const historicalScores = historicalScoresIn
    ?? loadHistoricalScores(reportDate, reportsDir, 14, reportScopeId);

  const {
    scopedSignals,
    macroSignals,
    baseSignalsForScoring,
  } = scopeAndPartitionSignals(allSignals, reportScopeId);

  const investigationPrep = await prepareInvestigationSignals({
    investigationSignals: baseSignalsForScoring,
    reportDate,
    reportScopeId,
    reportsDir,
  });

  const investigationEpistemic = deriveInvestigationEpistemicContext(investigationPrep.dataVoid);
  const investigationSignals = investigationPrep.investigationSignals;

  if (investigationSignals.length === 0 && macroSignals.length === 0) {
    const err = new Error('No scoped evidence signals for assessment');
    err.code = 'empty_scoped_evidence';
    throw err;
  }

  const prepared = await prepareScoringSignals({
    signalsForScoring: baseSignalsForScoring,
    reportDate,
    reportScopeId,
    reportsDir,
  });

  const scopedArticleKeys = new Set(
    investigationSignals
      .map((s) => s.article_url || (s.article_index ?? null))
      .filter((v) => v != null),
  );
  const scopedTotalArticles = reportScopeId === ISRAEL_NATIONAL_DISTRICT_ID
    ? totalArticles
    : Math.max(scopedArticleKeys.size, 1);

  const validationMaturity = summarizeValidationMaturity({ rootDir });
  let salienceContext = salienceContextFromDataVoid(prepared.dataVoid);

  const pipelineResult = runScoringPipeline({
    signalsForScoring: prepared.signalsForScoring,
    dataVoid: prepared.dataVoid,
    totalArticles: scopedTotalArticles,
    mediaSignals: scopedSignals,
    salienceContext,
    historicalScores,
    scopeId: reportScopeId,
    validationMaturity,
    priorQuarantine: prepared.priorQuarantine,
    reportDate,
  });

  const scoredFull = pipelineResult.scoredFull;
  salienceContext = pipelineResult.salienceContext;
  const signalsForScoring = pipelineResult.scoringSignals;

  onScoreComplete?.();

  const assessment = await produceAssessmentWithShadow({
    targetDate: reportDate,
    reportScopeId,
    investigationSignals,
    investigationEpistemic,
    signalsForScoring,
    scopedSignals,
    scoredFull,
    scopedTotalArticles,
    dataVoid: investigationPrep.dataVoid,
    assessmentMode: investigationEpistemic.assessmentMode,
    epistemicStatus: investigationEpistemic.epistemicStatus,
    retrievalService,
    sourceArchive,
    evidenceStore,
    oovBurst: investigationPrep.oovBurst,
    openObservations,
    onUsage,
    reportsDir,
    llmPort,
    dailyBudgetExceeded,
  });

  onNarrateComplete?.();

  applySharedAssessmentPostMetadata(assessment, {
    investigationEpistemic,
    investigationPrep,
    pipelineResult,
    reportScopeId,
    reportDate,
    scopedSignals,
    macroSignals,
    signalsForScoring,
    scoredFull,
    oovScoringApplied: prepared.oovScoringApplied,
    openObservationsSummary,
  });

  if (shouldAttachBrief) {
    await attachDecisionBrief(assessment, { reportScopeId, onUsage });
  }

  return {
    assessment,
    allSignals,
    scopedSignals,
    macroSignals,
    baseSignalsForScoring,
    investigationPrep,
    investigationEpistemic,
    investigationSignals,
    signalsForScoring,
    scopedTotalArticles,
    scoredFull,
    pipelineResult,
    dataVoid: investigationPrep.dataVoid,
    osintChannelQuarantine: investigationPrep.osintChannelQuarantine,
    oovBurst: investigationPrep.oovBurst,
    priorQuarantine: investigationPrep.priorQuarantine,
    assessmentMode: investigationEpistemic.assessmentMode,
    epistemicStatus: investigationEpistemic.epistemicStatus,
    scoringAssessmentMode: pipelineResult.assessmentMode,
    scoringEpistemicStatus: pipelineResult.epistemicStatus,
    staleDigitalScores: pipelineResult.staleDigitalScores,
    quarantinedDigital: pipelineResult.quarantinedDigital,
    validationMaturity,
    epistemicEnrichment: pipelineResult.epistemicEnrichment,
    oovScoringApplied: prepared.oovScoringApplied,
    digitalQuarantineState: pipelineResult.digitalQuarantineState,
    scoringPartition: pipelineResult.partition ?? null,
    salienceContext,
    historicalScores,
    scoringPipelineContext: {
      dataVoid: prepared.dataVoid,
      scopedTotalArticles,
      scopedSignals,
      salienceContext: pipelineResult.salienceContext,
      historicalScores,
      priorQuarantine: prepared.priorQuarantine,
      validationMaturity,
    },
  };
}
