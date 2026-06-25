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
import { operatorEpistemicOverlayEnabled } from '../../../cross-cut-modules/resilience-contracts/operatorEpistemicOverlay.js';
import { attachInvestigationDiagnostics } from '../domain/services/componentDiagnostics.js';
import { countAndLogDefaultNorthSignals, evaluateDefaultNorthGate } from '../domain/services/scopeAttributionMetrics.js';
import { buildNorthClusterNarrativesFromSignals } from '../domain/services/northClusterNarrative.js';
import {
  mergeNationalContextSignals,
  summarizeNationalContext,
} from '../domain/services/narrativeScopeSignals.js';
import { finalizeOperatorNarrativeSurface } from '../domain/services/operatorNarrativeSurface.js';
import { attachRichOperatorSurface } from '../domain/services/operatorInvestigationSurface.js';
import { shouldUseRichDeterministicPath } from '../../../cross-cut-modules/resilience-contracts/operatorSurfaceMode.js';
import { buildClosedCoreAssessmentShell } from './buildClosedCoreAssessmentShell.js';
import {
  getSocialQuarantineDecision,
} from '../domain/services/socialQuarantineOverrides.js';
import { tryOpenValidationStore } from './socialQuarantineWiring.js';
import { summarizeValidationMaturity } from '../validation/domain/validationStatus.js';
import { ISRAEL_NATIONAL_DISTRICT_ID } from '../../../cross-cut-modules/geo/israelDistricts.js';
import {
  produceAssessmentWithShadow,
  attachShadowDivergenceToAssessment,
} from './produceAssessmentWithShadow.js';
import { applyOperatorNarrativePipeline } from './operatorNarrativePipeline.js';
import { attachDecisionBrief } from './attachDecisionBrief.js';
import { loadHistoricalScores } from './assessSignalsHelpers.js';
import { ensureArticleCorpusRagIndexed } from './ensureArticleCorpusRagIndexed.js';
import { isClosedCoreAssessEnabled, isOmissionAuditEnabled } from '../domain/services/openExtractConfig.js';
import { shadowScoringEnabled } from '../../../cross-cut-modules/agent/index.js';
import { closedCoreNarrate } from './closedCoreNarrate.js';
import { buildAndWriteOmissionAudit } from './omissionAuditService.js';
import { reportScopeMetadata } from '../domain/services/regionSignalFilter.js';
import { countOovCapturesForDate } from '../domain/services/oovCapture.js';

/**
 * @param {object} assessment
 * @param {object} ctx
 * @param {object} investigationPrep
 * @param {string} reportDate
 * @param {string} reportScopeId
 */
function attachInvestigationContextFlags(assessment, ctx, investigationPrep, reportDate, reportScopeId) {
  assessment.oov_burst = investigationPrep.oovBurst ?? null;
  if (ctx.oovScoringApplied) {
    assessment.oov_scoring_applied = ctx.oovScoringApplied;
  }
  if (ctx.omissionAuditSummary) {
    assessment.omission_audit_summary = ctx.omissionAuditSummary;
  }
  if (ctx.openObservationsSummary) {
    assessment.open_observations_summary = ctx.openObservationsSummary;
  }
  if (ctx.openEvidenceScoringApplied) {
    assessment.open_evidence_scoring_applied = ctx.openEvidenceScoringApplied;
  }
  if (!investigationPrep.osintChannelQuarantine) return;

  const decision = investigationPrep.osintChannelQuarantine.active
    ? getSocialQuarantineDecision(reportDate, reportScopeId, tryOpenValidationStore())
    : null;
  assessment.social_channel_quarantine = {
    ...investigationPrep.osintChannelQuarantine,
    ...(decision?.created_at ? { confirmed_at: decision.created_at } : {}),
  };
}

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

  attachInvestigationContextFlags(
    assessment,
    ctx,
    investigationPrep,
    reportDate,
    reportScopeId,
  );

  const patterns = detectSemanticPatterns(scopedSignals ?? []);
  assessment.pattern_alerts = patterns;
  countAndLogDefaultNorthSignals(scopedSignals, { assessment });
  if (operatorEpistemicOverlayEnabled()) {
    assessment.operator_recommendations = buildOperatorRecommendations(patterns);
  }

  attachInvestigationDiagnostics(assessment, {
    scoring: {
      investigationSignals: investigationPrep.investigationSignals,
      signalsForScoring: signalsForScoring ?? investigationPrep.investigationSignals,
      scopedSignals,
      macroSignals: ctx.macroSignals ?? [],
      narrativeScopeSignals: ctx.narrativeScopeSignals ?? scopedSignals,
      narrativeNationalContext: ctx.narrativeNationalContext ?? [],
      scoredFull: scoredFull ?? null,
      scoringPartition: pipelineResult?.partition ?? null,
      scoringAssessmentMode: pipelineResult?.assessmentMode ?? null,
      assessmentMode: investigationEpistemic.assessmentMode,
    },
    investigationPlan: assessment.investigation_plan,
  });

  if (ctx.scopeAttribution) {
    assessment.scope_attribution = ctx.scopeAttribution;
  }
  if (ctx.narrativeScopeSignalCount != null) {
    assessment.narrative_scope_signal_count = ctx.narrativeScopeSignalCount;
  }
  if (ctx.nationalContextSignals?.length) {
    assessment.national_context_signals = ctx.nationalContextSignals;
    assessment.national_context_summary = summarizeNationalContext(ctx.nationalContextSignals);
  }
  if (ctx.northClusterNarratives) {
    assessment.north_cluster_narratives = ctx.northClusterNarratives;
  }

  if (shouldUseRichDeterministicPath()) {
    const partition = pipelineResult?.partition;
    const investigationSet = investigationPrep.investigationSignals ?? signalsForScoring ?? [];
    const metricsSet = new Set(signalsForScoring ?? []);
    const scoringQuarantined = [];
    for (const signal of investigationSet) {
      if (!metricsSet.has(signal)) scoringQuarantined.push(signal);
    }
    attachRichOperatorSurface(assessment, {
      narrativeScopeSignals: ctx.narrativeScopeSignals ?? scopedSignals ?? [],
      signalsForScoring: signalsForScoring ?? [],
      quarantinedSignals: partition?.quarantinedSignals ?? [],
      scoringQuarantinedSignals: scoringQuarantined,
    });
  }

  finalizeOperatorNarrativeSurface(assessment);
}

async function maybeEnsureRagIndexed({
  skipRagBackfill,
  retrievalService,
  onUsage,
  reportDate,
  assessmentDays,
  rootDir,
}) {
  if (skipRagBackfill || !retrievalService) return;
  if (retrievalService.setOnUsage && onUsage) {
    retrievalService.setOnUsage(onUsage);
  }
  await ensureArticleCorpusRagIndexed({
    targetDate: reportDate,
    days: assessmentDays,
    retrievalService,
    repoRoot: rootDir,
  });
}

function assertDefaultNorthGate(defaultNorthGate, scopedSignals) {
  if (!defaultNorthGate.blocked) {
    if (defaultNorthGate.count > 0 && !defaultNorthGate.blockEnabled) {
      console.error(
        `  ⚠ Default-north fallback ${defaultNorthGate.pct}% (threshold ${defaultNorthGate.thresholdPct}%) — warn only`,
      );
    }
    return;
  }
  const err = new Error(
    `Default-north fallback ${defaultNorthGate.pct}% exceeds gate threshold ${defaultNorthGate.thresholdPct}% (${defaultNorthGate.count}/${scopedSignals.length} signals)`,
  );
  err.code = 'default_north_threshold_exceeded';
  err.gate = defaultNorthGate;
  throw err;
}

/**
 * @param {object} ctx
 * @returns {Promise<object>}
 */
async function produceAssessmentForMode(ctx) {
  const {
    reportScopeId,
    reportDate,
    scopedTotalArticles,
    investigationPrep,
    investigationEpistemic,
    investigationSignals,
    signalsForScoring,
    scopedSignals,
    narrativeScopeSignals,
    scoredFull,
    pipelineResult,
    retrievalService,
    sourceArchive,
    evidenceStore,
    openObservations,
    onUsage,
    reportsDir,
    llmPort,
    dailyBudgetExceeded,
  } = ctx;

  if (shouldUseRichDeterministicPath()) {
    console.error('[assess-signals] Rich operator surface: score shell + deterministic pool (no specialists, no narrative LLM)');
    const reportScope = reportScopeMetadata(reportScopeId);
    const assessment = buildClosedCoreAssessmentShell({
      scoredFull,
      reportDate,
      scopedTotalArticles,
      reportScope,
      macroSignals: ctx.macroSignals,
      dataVoid: investigationPrep.dataVoid,
      oovCaptureCount: countOovCapturesForDate(reportDate, reportsDir),
      socialChannelQuarantine: investigationPrep.osintChannelQuarantine ?? null,
      allScopedSignals: scopedSignals,
    });
    if (shadowScoringEnabled()) {
      attachShadowDivergenceToAssessment(assessment, {
        scoredFull,
        reportScopeId,
        targetDate: reportDate,
        reportsDir,
      });
    }
    return assessment;
  }

  if (isClosedCoreAssessEnabled()) {
    console.error('[assess-signals] Closed-core assess: hybrid narrative pipeline (score shell + digest)');
    const reportScope = reportScopeMetadata(reportScopeId);
    const assessment = await closedCoreNarrate(
      scoredFull,
      signalsForScoring,
      reportDate,
      scopedTotalArticles,
      {
        onUsage,
        dataVoid: investigationPrep.dataVoid,
        allScopedSignals: scopedSignals,
        narrativeScopeSignals,
        narrativeScoringContext: pipelineResult.digitalInclusiveScored ?? scoredFull,
        scoringPartition: pipelineResult.partition ?? null,
        quarantinedDigital: pipelineResult.quarantinedDigital ?? null,
        signalsScoringUsed: signalsForScoring.length,
        macroSignals: ctx.macroSignals,
        retrievalService,
        reportScope,
        oovCaptureCount: countOovCapturesForDate(reportDate, reportsDir),
        socialChannelQuarantine: investigationPrep.osintChannelQuarantine ?? null,
        llmPort,
      },
    );
    if (shadowScoringEnabled()) {
      attachShadowDivergenceToAssessment(assessment, {
        scoredFull,
        reportScopeId,
        targetDate: reportDate,
        reportsDir,
      });
    }
    return assessment;
  }

  const assessment = await produceAssessmentWithShadow({
    targetDate: reportDate,
    reportScopeId,
    investigationSignals,
    investigationEpistemic,
    signalsForScoring,
    scopedSignals,
    narrativeScopeSignals,
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

  await applyOperatorNarrativePipeline({
    assessment,
    narrativeScopeSignals,
    scoredFull,
    narrativeScoringContext: pipelineResult.digitalInclusiveScored ?? scoredFull,
    scoringPartition: pipelineResult.partition ?? null,
    quarantinedDigital: pipelineResult.quarantinedDigital ?? null,
    signalsScoringUsed: signalsForScoring.length,
    retrievalService,
    reportDate,
    onUsage,
    llmPort,
  });

  return assessment;
}

/**
 * @param {string} reportDate
 * @param {string} reportScopeId
 * @param {object[]} scopedSignals
 * @param {string} reportsDir
 * @returns {object|null}
 */
function runOmissionAuditIfEnabled(reportDate, reportScopeId, scopedSignals, reportsDir) {
  if (!isOmissionAuditEnabled()) return null;
  const audit = buildAndWriteOmissionAudit({
    date: reportDate,
    reportScopeId,
    closedSignals: scopedSignals,
    reportsDir,
  });
  console.error(
    `  → Omission audit: ${audit.path} `
    + `(zero-signal=${audit.summary.zero_signal_article_count}, residual=${audit.summary.residual_observation_count})`,
  );
  return audit.summary;
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
    assessmentDays = 1,
    skipRagBackfill = false,
  } = params;

  await maybeEnsureRagIndexed({
    skipRagBackfill,
    retrievalService,
    onUsage,
    reportDate,
    assessmentDays,
    rootDir,
  });

  const historicalScores = historicalScoresIn
    ?? loadHistoricalScores(reportDate, reportsDir, 14, reportScopeId);

  const {
    scopedSignals,
    macroSignals,
    baseSignalsForScoring,
    narrativeNationalContext,
    regionalPressContext,
    narrativeScopeSignals,
  } = scopeAndPartitionSignals(allSignals, reportScopeId);

  const defaultNorthGate = evaluateDefaultNorthGate(scopedSignals);
  assertDefaultNorthGate(defaultNorthGate, scopedSignals);

  const scopeAttribution = {
    default_district_signal_count: defaultNorthGate.count,
    default_district_pct: defaultNorthGate.pct,
    gate_threshold_pct: defaultNorthGate.thresholdPct,
    gate_warning: defaultNorthGate.count > 0 && defaultNorthGate.pct > defaultNorthGate.thresholdPct,
  };

  const investigationPrep = await prepareInvestigationSignals({
    investigationSignals: baseSignalsForScoring,
    reportDate,
    reportScopeId,
    reportsDir,
    allSignalsForDiagnostics: allSignals,
  });

  const investigationEpistemic = deriveInvestigationEpistemicContext(investigationPrep.dataVoid);
  const investigationSignals = investigationPrep.investigationSignals;

  if (investigationSignals.length === 0 && macroSignals.length === 0
    && narrativeNationalContext.length === 0 && regionalPressContext.length === 0) {
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

  const assessment = await produceAssessmentForMode({
    reportScopeId,
    reportDate,
    scopedTotalArticles,
    investigationPrep,
    investigationEpistemic,
    investigationSignals,
    signalsForScoring,
    scopedSignals,
    macroSignals,
    narrativeScopeSignals,
    scoredFull,
    pipelineResult,
    retrievalService,
    sourceArchive,
    evidenceStore,
    openObservations,
    onUsage,
    reportsDir,
    llmPort,
    dailyBudgetExceeded,
  });

  const omissionAuditSummary = runOmissionAuditIfEnabled(
    reportDate,
    reportScopeId,
    scopedSignals,
    reportsDir,
  );

  onNarrateComplete?.();

  const nationalContextSignals = mergeNationalContextSignals(
    macroSignals,
    narrativeNationalContext,
    regionalPressContext,
  );
  const northClusterNarratives = reportScopeId === 'north'
    ? buildNorthClusterNarrativesFromSignals(narrativeScopeSignals)
    : null;

  applySharedAssessmentPostMetadata(assessment, {
    investigationEpistemic,
    investigationPrep,
    pipelineResult,
    reportScopeId,
    reportDate,
    scopedSignals,
    macroSignals,
    narrativeScopeSignals,
    narrativeNationalContext,
    narrativeScopeSignalCount: narrativeScopeSignals.length,
    nationalContextSignals,
    scopeAttribution,
    northClusterNarratives,
    signalsForScoring,
    scoredFull,
    oovScoringApplied: prepared.oovScoringApplied,
    openObservationsSummary,
    omissionAuditSummary,
  });

  if (shouldAttachBrief) {
    await attachDecisionBrief(assessment, { reportScopeId, onUsage });
  }

  return {
    assessment,
    allSignals,
    scopedSignals,
    macroSignals,
    narrativeNationalContext,
    narrativeScopeSignals,
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
