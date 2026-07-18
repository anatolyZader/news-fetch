/**
 * Scoped scoring for the assess-signals CLI: core assessment run, per-source
 * score breakdown, and open-evidence scoring wiring.
 * Extracted verbatim from assessSignalsCli.js (behavior-preserving split).
 */

import { scoreComponents } from '../scoringFacade.js';
import { isRegionalReportScope } from '../../../../cross-cut-modules/geo/reportScopeIds.js';
import { resilienceReportsDir } from '../../domain/services/paths/outputDirs.js';
import { ISRAEL_NATIONAL_DISTRICT_ID } from '../../../../cross-cut-modules/geo/israelDistricts.js';
import {
  loadHistoricalScores,
  loadHistoricalSignalDays,
} from '../../infrastructure/reportHistoryReader.js';
import { runPostExtractionAssessmentCore } from './assessmentStage.js';
import {
  buildAssessmentMethodology,
  formatScopeDecisionLogLine,
} from '../../domain/epistemic/assessmentMethodology.js';
import { computeDataVoidIndex } from '../../domain/services/dataVoidIndex.js';
import { runScoringPipeline } from './scoringPipelinePrep.js';
import { salienceContextFromDataVoid } from '../../domain/epistemic/highSalienceBypass.js';
import { isOmissionAuditEnabled } from '../../domain/services/oov/openExtractConfig.js';
import { verifyOpenEvidenceClaims } from '../../domain/services/signals/openEvidenceVerification.js';
import { synthesizeOpenEvidenceScoringSignals } from '../../domain/services/signals/openEvidenceScoringSignals.js';
import { enqueueVerifiedOpenForCatalog } from '../catalog/enqueueVerifiedOpenForCatalog.js';
import { REPO_ROOT, formatDaysSuffix } from './assessSignalsDeps.js';

function logBuildScopedDiagnostics({
  reportScopeId,
  reportScope,
  nationalSignals,
  scopedSignals,
  metricsSignals,
  macroSignals,
  narrativeScopeSignals,
  narrativeNationalContext,
  dataVoid,
  scopeLogLine,
}) {
  if (isRegionalReportScope(reportScopeId) && macroSignals.length > 0) {
    console.error(`  → Epistemic partition: ${metricsSignals.length} metrics-eligible, ${macroSignals.length} macro/context-only`);
  }
  if (isRegionalReportScope(reportScopeId) && narrativeScopeSignals != null) {
    console.error(
      `  → Narrative scope: ${narrativeScopeSignals.length} signals (${narrativeNationalContext?.length ?? 0} national context)`,
    );
  }
  if (reportScopeId !== ISRAEL_NATIONAL_DISTRICT_ID) {
    console.error(`  → Scope filter (${reportScope.label}): ${scopedSignals.length}/${nationalSignals.length} signals retained`);
  }
  if (dataVoid.level && dataVoid.level !== 'none') {
    console.error(`  → Data void: level=${dataVoid.level} reason=${dataVoid.reason ?? 'n/a'} digital_darkness=${dataVoid.digital_darkness}`);
  }
  if (scopeLogLine) console.error(scopeLogLine);
}

function buildScoreBySource({
  scopedSourceTypesSeen,
  signalsForScoring,
  reportScopeId,
  loadedFiles,
  salienceContext,
}) {
  const scoreBySource = {};
  for (const sourceType of scopedSourceTypesSeen) {
    const sourceSigs = signalsForScoring.filter((s) => s.source_type === sourceType);
    const sourceArticles = reportScopeId === ISRAEL_NATIONAL_DISTRICT_ID
      ? loadedFiles
        .filter((f) => f.sourceType === sourceType)
        .reduce((sum, f) => sum + (f.data.total_articles ?? 0), 0)
      : Math.max(new Set(sourceSigs.map((s) => s.article_url || (s.article_index ?? null)).filter((v) => v != null)).size, 1);
    scoreBySource[sourceType] = scoreComponents(sourceSigs, {
      totalArticles: sourceArticles,
      salienceContext,
    });
  }
  return scoreBySource;
}

export async function buildScopedScoring(targetDate, days, allSignals, totalArticles, reportScopeId, reportScope, loadedFiles, openObservations = [], routingOpts = {}) {
  const nationalSignals = allSignals;
  const nationalHistoricalDays = isRegionalReportScope(reportScopeId)
    ? loadHistoricalSignalDays(targetDate, resilienceReportsDir(), 7, ISRAEL_NATIONAL_DISTRICT_ID)
    : loadHistoricalSignalDays(targetDate, resilienceReportsDir(), 7, reportScopeId);

  const routedOpenObservations = openObservations.length
    ? await (async () => {
      const { routeOpenObservations } = await import('../../open_observation_extraction/index.js');
      return routeOpenObservations(openObservations, routingOpts);
    })()
    : [];

  if (routedOpenObservations.length > 0) {
    console.error(`  → Open observations loaded: ${routedOpenObservations.length} (pipeline parallel extract)`);
  }

  const historicalScores = loadHistoricalScores(targetDate, resilienceReportsDir(), 14, reportScopeId);
  if (Object.keys(historicalScores).length > 0) {
    console.error(`  Loaded historical score series for ${Object.keys(historicalScores).length} components`);
  }

  const nationalDataVoid = isRegionalReportScope(reportScopeId)
    ? computeDataVoidIndex(nationalSignals, nationalHistoricalDays, { reportScope: ISRAEL_NATIONAL_DISTRICT_ID })
    : null;

  let coreResult;
  try {
    coreResult = await runPostExtractionAssessmentCore({
      allSignals,
      reportScopeId,
      reportDate: targetDate,
      totalArticles,
      reportsDir: resilienceReportsDir(),
      historicalScores,
      onUsage: routingOpts.onUsage,
      retrievalService: routingOpts.retrievalService ?? null,
      sourceArchive: routingOpts.sourceArchive ?? null,
      openObservations: routedOpenObservations,
      openObservationsSummary: routingOpts.openObservationsSummary ?? null,
      rootDir: REPO_ROOT,
      dailyBudgetExceeded: routingOpts.dailyBudgetExceeded ?? false,
      attachDecisionBrief: false,
      skipRagBackfill: true,
      assessmentDays: days,
    });
  } catch (err) {
    if (err?.code === 'empty_scoped_evidence') {
      const suffix = formatDaysSuffix(days);
      throw new Error(`No signal files contained ${reportScope.label} evidence for ${targetDate}${suffix}.`, { cause: err });
    }
    if (err?.code === 'default_north_threshold_exceeded') {
      const gate = err.gate ?? {};
      throw new Error(
        `Default-north fallback ${gate.pct ?? '?'}% exceeds threshold ${gate.thresholdPct ?? '?'}% `
        + `(${gate.count ?? '?'} signals) — fix extractor district_id or set RESILIENCE_DEFAULT_NORTH_GATE_BLOCK=0`,
        { cause: err },
      );
    }
    throw err;
  }

  const {
    assessment,
    scopedSignals,
    macroSignals,
    narrativeNationalContext,
    narrativeScopeSignals,
    investigationSignals,
    investigationEpistemic,
    signalsForScoring,
    scopedTotalArticles,
    scoredFull,
    pipelineResult,
    investigationPrep,
    dataVoid,
    salienceContext,
  } = coreResult;

  const metricsSignals = scopedSignals.filter((s) => s?.metricsEligible !== false);
  const scopeMethodologyPreview = buildAssessmentMethodology({ signals: scopedSignals, reportScopeId });
  const scopeLogLine = formatScopeDecisionLogLine(scopeMethodologyPreview);
  logBuildScopedDiagnostics({
    reportScopeId,
    reportScope,
    nationalSignals,
    scopedSignals,
    metricsSignals,
    macroSignals,
    narrativeScopeSignals,
    narrativeNationalContext,
    dataVoid,
    scopeLogLine,
  });

  let nationalSalienceContext = salienceContextFromDataVoid(dataVoid);
  const nationalScored = scoreComponents(nationalSignals, { totalArticles, salienceContext: nationalSalienceContext });

  const scopedSourceTypesSeen = new Set(signalsForScoring.map((s) => s.source_type).filter(Boolean));
  const scoreBySource = buildScoreBySource({
    scopedSourceTypesSeen,
    signalsForScoring,
    reportScopeId,
    loadedFiles,
    salienceContext,
  });

  return {
    assessment,
    nationalSignals,
    nationalScored,
    nationalDataVoid,
    scopedSignals,
    investigationSignals,
    investigationEpistemic,
    signalsForScoring,
    macroSignals,
    scopedTotalArticles,
    scoredFull,
    scoreBySource,
    dataVoid,
    osintChannelQuarantine: investigationPrep.osintChannelQuarantine,
    oovBurst: investigationPrep.oovBurst,
    priorQuarantine: investigationPrep.priorQuarantine,
    assessmentMode: investigationEpistemic.assessmentMode,
    epistemicStatus: investigationEpistemic.epistemicStatus,
    scoringAssessmentMode: pipelineResult.assessmentMode,
    scoringEpistemicStatus: pipelineResult.epistemicStatus,
    staleDigitalScores: pipelineResult.staleDigitalScores,
    quarantinedDigital: pipelineResult.quarantinedDigital,
    validationMaturity: coreResult.validationMaturity,
    epistemicEnrichment: pipelineResult.epistemicEnrichment,
    oovScoringApplied: coreResult.oovScoringApplied,
    digitalQuarantineState: pipelineResult.digitalQuarantineState,
    scoringPartition: pipelineResult.partition ?? null,
    openObservations: routedOpenObservations,
    openObservationsSummary: routingOpts.openObservationsSummary ?? null,
    scoringPipelineContext: coreResult.scoringPipelineContext,
  };
}

export async function applyOpenEvidenceScoringIfVerified({
  assessment,
  scoring,
  targetDate,
  reportScopeId,
}) {
  if (isOmissionAuditEnabled()) return;
  const openObservations = scoring.openObservations ?? [];
  const verified = verifyOpenEvidenceClaims(assessment, openObservations, assessment._evidence_graph);
  if (!verified.length) return;

  const { signals: syntheticOpen, applied } = synthesizeOpenEvidenceScoringSignals(
    verified,
    openObservations,
    { reportDate: targetDate, reportScopeId },
  );
  if (!applied || !syntheticOpen.length) return;

  const ctx = scoring.scoringPipelineContext ?? {};
  const pipelineResult = runScoringPipeline({
    signalsForScoring: [...scoring.signalsForScoring, ...syntheticOpen],
    dataVoid: ctx.dataVoid ?? scoring.dataVoid,
    totalArticles: ctx.scopedTotalArticles ?? scoring.scopedTotalArticles,
    mediaSignals: ctx.scopedSignals ?? scoring.scopedSignals,
    salienceContext: ctx.salienceContext,
    historicalScores: ctx.historicalScores ?? {},
    scopeId: reportScopeId,
    validationMaturity: ctx.validationMaturity ?? scoring.validationMaturity,
    priorQuarantine: ctx.priorQuarantine ?? scoring.priorQuarantine,
    reportDate: targetDate,
  });

  scoring.scoredFull = pipelineResult.scoredFull;
  scoring.signalsForScoring = pipelineResult.scoringSignals;
  scoring.openEvidenceScoringApplied = applied;
  console.error(`  → Open evidence scoring: ${syntheticOpen.length} verified synthetic signal(s)`);

  const enqueueResult = await enqueueVerifiedOpenForCatalog(verified, openObservations, {
    assessment,
    reportDate: targetDate,
    reportScopeId,
    repoRoot: REPO_ROOT,
  });
  if (enqueueResult.enqueued > 0) {
    console.error(`  → Catalog evolution enqueue: ${enqueueResult.enqueued} verified open observation(s)`);
  }
}
