/**
 * Stage 2 — shared post-extraction assessment core (scope → evidence → narrate → metadata).
 *
 * **Owns:** signal scoping/partitioning, investigation prep, count-based evidence pipeline,
 * assessment mode routing (agent vs closed-core vs rich deterministic), and post-assessment
 * operator surface attachment.
 *
 * **Pipeline position:** after extraction (Stage 1) or bundle load; used by `assessSignalsCli`
 * and `resilienceAnalysisService.runResilienceAssessment`.
 *
 * **Inputs:** merged signal list, report date/scope, article counts, optional RAG/LLM ports,
 * open observations, budget flags.
 *
 * **Outputs:** `{ assessment, scopedSignals, scoredFull, pipelineResult, … }` for report writers;
 * mutates assessment with epistemic overlays, pattern alerts, diagnostics.
 *
 * **Does NOT:** extract signals, load bundles from disk, or compute numeric resilience scores.
 *
 * **Collaborators:** `evidencePipelinePrep`, `produceAssessment`, `closedCoreNarrate`,
 * `operatorNarrativePipeline`, `specialist_agents` (via produceAssessment),
 * `domain/epistemic`, `domain/services/operator`.
 */
import { scopeAndPartitionSignals } from './signalScopePartition.js';
import { prepareInvestigationSignals, prepareScoringSignals } from './prepareSignals.js';
import { runScoringPipeline } from './evidencePipelinePrep.js';
import { deriveInvestigationEpistemicContext } from '../../domain/epistemic/investigationEpistemicContext.js';
import { resilienceReportsDir } from '../../domain/services/paths/outputDirs.js';
import { salienceContextFromDataVoid } from '../../domain/epistemic/highSalienceBypass.js';
import { attachEpistemicToAssessment } from '../../domain/services/dataVoidIndex.js';
import { detectSemanticPatterns } from '../../domain/services/patternDetection/semanticPatternAlerts.js';
import { buildOperatorRecommendations } from '../../domain/services/patternDetection/operatorRecommendations.js';
import { operatorEpistemicOverlayEnabled } from '../../domain/contracts/operatorEpistemicOverlay.js';
import { attachInvestigationDiagnostics } from '../../domain/services/operator/componentDiagnostics.js';
import { countAndLogDefaultNorthSignals, evaluateDefaultNorthGate } from '../../domain/services/signals/scopeAttributionMetrics.js';
import { buildNorthClusterNarrativesFromSignals } from '../../domain/services/narrative/northClusterNarrative.js';
import {
  mergeNationalContextSignals,
  summarizeNationalContext,
} from '../../domain/services/narrative/narrativeScopeSignals.js';
import { finalizeOperatorNarrativeSurface } from '../../domain/services/operator/operatorNarrativeSurface.js';
import { attachRichOperatorSurface } from '../../domain/services/operator/operatorInvestigationSurface.js';
import { shouldUseRichDeterministicPath } from '../../domain/contracts/operatorSurfaceMode.js';
import { ISRAEL_NATIONAL_DISTRICT_ID } from '../../../../cross-cut-modules/geo/israelDistricts.js';
import { produceAssessment } from './produceAssessment.js';
import { applyOperatorNarrativePipeline } from './operatorNarrativePipeline.js';
import { attachDecisionBrief } from './attachDecisionBrief.js';
import { ensureArticleCorpusRagIndexed } from './ensureArticleCorpusRagIndexed.js';
import { isClosedCoreAssessEnabled, isOmissionAuditEnabled } from '../../domain/services/oov/openExtractConfig.js';
import { closedCoreNarrate } from './closedCoreNarrate.js';
import { buildAndWriteOmissionAudit } from './omissionAuditService.js';
import { reportScopeMetadata } from '../../domain/services/signals/regionSignalFilter.js';
import { countOovCapturesForDate } from '../../domain/services/oov/oovCapture.js';

/**
 * @param {object} assessment
 * @param {object} ctx
 * @param {object} investigationPrep
 */
/** Copy OOV/open-observation/quarantine flags from investigation prep onto the assessment object. */
function attachInvestigationContextFlags(assessment, ctx, investigationPrep) {
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

  assessment.social_channel_quarantine = investigationPrep.osintChannelQuarantine;
}

/**
 * Attach epistemic status, pattern alerts, diagnostics, and operator narrative surface to assessment.
 *
 * @param {object} assessment — mutates in place
 * @param {object} ctx — investigation/scoring context from runPostExtractionAssessmentCore
 * @returns {void}
 */
export function applySharedAssessmentPostMetadata(assessment, ctx) {
  const {
    investigationEpistemic,
    investigationPrep,
    pipelineResult,
    scopedSignals,
    signalsForScoring,
    scoredFull,
  } = ctx;

  attachEpistemicToAssessment(assessment, {
    dataVoid: investigationPrep.dataVoid,
    epistemicStatus: investigationEpistemic.epistemicStatus,
    assessmentMode: investigationEpistemic.assessmentMode,
    quarantinedDigital: pipelineResult?.quarantinedDigital ?? null,
    digitalQuarantineState: pipelineResult?.digitalQuarantineState ?? null,
  });

  attachInvestigationContextFlags(assessment, ctx, investigationPrep);

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

/** Optional RAG backfill for article corpus before agent/narrative retrieval. */
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

/** Throw when default-north fallback share exceeds configured gate (scope attribution quality). */
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
 * Route to closed-core narrate, rich deterministic path, or full assessment agent + operator pipeline.
 * @returns {Promise<object>} assessment shell with narratives filled when applicable
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

  if (shouldUseRichDeterministicPath() || isClosedCoreAssessEnabled()) {
    const pathLabel = shouldUseRichDeterministicPath()
      ? 'Rich operator surface: score shell + hybrid narrative (no specialists)'
      : 'Closed-core assess: hybrid narrative pipeline (score shell + digest)';
    console.error(`[assess-signals] ${pathLabel}`);
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
    return assessment;
  }

  const assessment = await produceAssessment({
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

/** Run optional omission audit artifact when env flag enabled; returns summary for assessment. */
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
 * Shared Stage-2 assessment core after signals are available (extracted or loaded).
 *
 * @param {object} params
 * @param {object[]} params.allSignals — merged signals for the assessment window
 * @param {string} params.reportScopeId
 * @param {string} params.reportDate — YYYY-MM-DD
 * @param {number} params.totalArticles
 * @param {Function} [params.onScoreComplete] — called after evidence pipeline
 * @param {Function} [params.onNarrateComplete] — called after narrative/agent path
 * @returns {Promise<object>} assessment plus intermediate scoring/scoping artifacts for callers
 * @throws when scoped evidence is empty or default-north gate blocks
 * @sideEffects LLM/agent/narrative calls; optional RAG index; mutates signal lists in return value
 */
export async function runPostExtractionAssessmentCore(params) {
  const {
    allSignals,
    reportScopeId,
    reportDate,
    totalArticles,
    reportsDir = resilienceReportsDir(),
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

  const historicalScores = historicalScoresIn ?? {};

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

  // Analyst validation review was decommissioned — no maturity data is ever collected,
  // so calibration trust always falls back to its lowest tier (shrinks scores toward neutral).
  const validationMaturity = null;
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
