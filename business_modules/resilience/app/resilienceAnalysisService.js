/**
 * Application use case: ResilienceContentBatch → signals → investigation → optional shadow score.
 */
import { assertValidResilienceContentBatch } from '../domain/services/resilienceBatchValidation.js';
import { mergeDualExtractionSignals } from '../infrastructure/dualModelExtract.js';
import {
  normalizeReportScope,
} from '../domain/services/regionSignalFilter.js';
import { scopeAndPartitionSignals } from './assessmentPipeline.js';
import { attachEpistemicToAssessment } from '../domain/services/dataVoidIndex.js';
import { salienceContextFromDataVoid } from '../domain/services/highSalienceBypass.js';
import {
  getSocialQuarantineDecision,
} from '../domain/services/socialQuarantineOverrides.js';
import { tryOpenValidationStore } from './socialQuarantineWiring.js';
import { loadHistoricalScores } from '../app/assessSignalsHelpers.js';
import { runScoringPipeline } from './scoringPipelinePrep.js';
import { prepareScoringSignals } from './prepareScoringSignals.js';
import { prepareInvestigationSignals } from './prepareInvestigationSignals.js';
import { deriveInvestigationEpistemicContext } from '../domain/services/investigationEpistemicContext.js';
import { detectSemanticPatterns } from '../domain/services/patternDetection/semanticPatternAlerts.js';
import { buildOperatorRecommendations } from '../domain/services/patternDetection/operatorRecommendations.js';
import { attachDecisionBrief } from './attachDecisionBrief.js';
import { produceAssessmentWithShadow, attachShadowDivergenceToAssessment } from './produceAssessmentWithShadow.js';
import { attachInvestigationDiagnostics } from '../domain/services/componentDiagnostics.js';
import { loadConnectivityProbeSignals } from '../infrastructure/adapters/connectivityProbeFileAdapter.js';
import { enrichProbeSignalsInList } from '../domain/services/probeCorroborationPolicy.js';
import { summarizeValidationMaturity } from '../validation/domain/validationStatus.js';
import { resolve } from 'node:path';
import { createPipelineRunStore } from '../../../db/persistence/pipelineRunStore.js';
import { createPipelineRunTracker } from './pipelineRunTracker.js';

/** Aligned with infrastructure/mdReportsLoader.js body cap */
export const MAX_BODY_CHARS = 2000;

function resolvePipelineRunStore(options) {
  if (options.pipelineRunStore !== undefined) {
    return options.pipelineRunStore;
  }
  if (process.env.PIPELINE_RUN_TRACKING === '0') {
    return null;
  }
  const sqlitePath = process.env.SQLITE_PATH?.trim();
  const dbPath = sqlitePath
    ? resolve(sqlitePath)
    : resolve(process.cwd(), 'db', 'app.sqlite');
  return createPipelineRunStore(dbPath);
}

function batchItemsToArticles(batch) {
  const sourceFile = batch.sourceRunId == null ? 'content-batch' : String(batch.sourceRunId);
  return batch.items.map((item) => ({
    title: item.title,
    url: item.url ?? '',
    publishedAt: item.publishedAt ?? '',
    source: item.sourceLabel ?? 'batch',
    body: item.body.slice(0, MAX_BODY_CHARS),
    sourceFile,
    temporal_weight: item.temporal_weight ?? 1,
  }));
}

function dedupeArticlesByTitle(articles) {
  const seen = new Set();
  return articles.filter((a) => {
    const key = a.title.replaceAll(/[^\u0590-\u05FF\w]/g, '').slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueSourceLabels(articles) {
  return [...new Set(articles.map((a) => a.source).filter(Boolean))];
}

async function extractBatchSignals({
  batch,
  articles,
  llmPort,
  supplementaryArticles,
  supplementaryContentKind,
  onUsage,
  onProgress,
  reportScopeId,
}) {
  const llmOpts = { onUsage, onProgress, contentKind: batch.contentKind };
  let allSignals = await llmPort.extractSignals(articles, llmOpts);
  if (process.env.RESILIENCE_SECOND_EXTRACT === '1') {
    const secondModel = process.env.RESILIENCE_SECOND_EXTRACT_MODEL
      ?? process.env.RESILIENCE_SECOND_MODEL
      ?? undefined;
    const pass2 = await llmPort.extractSignals(articles, {
      ...llmOpts,
      extractModel: secondModel,
    });
    const requireAgreement = process.env.RESILIENCE_DUAL_REQUIRE_AGREEMENT !== '0';
    const merged = mergeDualExtractionSignals(allSignals, pass2, { requireAgreement });
    if (merged.dual_veto_dropped > 0) {
      console.error(
        `  → dual extract veto dropped ${merged.dual_veto_dropped} signal(s) without cross-pass agreement`,
      );
    }
    allSignals = merged.signals.length > 0 ? merged.signals : allSignals;
  }

  if (supplementaryArticles.length > 0) {
    const suppOpts = { onUsage, onProgress, contentKind: supplementaryContentKind };
    const suppSignals = await llmPort.extractSignals(supplementaryArticles, suppOpts);
    allSignals = [...allSignals, ...suppSignals];
  }

  const probeSignals = loadConnectivityProbeSignals(batch.reportDate, reportScopeId);
  if (probeSignals.length > 0) {
    allSignals = [...allSignals, ...probeSignals];
  }

  allSignals = enrichProbeSignalsInList(allSignals);
  const partitioned = scopeAndPartitionSignals(allSignals, reportScopeId);
  return {
    allSignals: partitioned.scopedSignals,
    baseSignalsForScoring: partitioned.baseSignalsForScoring,
    macroSignals: partitioned.macroSignals,
  };
}

async function runShadowScoring({
  baseSignalsForScoring,
  allSignals,
  batch,
  reportScopeId,
  reportsDir,
  totalArticles,
  rootDir,
}) {
  const prepared = await prepareScoringSignals({
    signalsForScoring: baseSignalsForScoring,
    reportDate: batch.reportDate,
    reportScopeId,
    reportsDir,
  });

  const salienceContext = salienceContextFromDataVoid(prepared.dataVoid);
  const validationMaturity = summarizeValidationMaturity({ rootDir });
  const historicalScores = loadHistoricalScores(batch.reportDate, reportsDir, 14, reportScopeId);

  const pipelineResult = runScoringPipeline({
    signalsForScoring: prepared.signalsForScoring,
    dataVoid: prepared.dataVoid,
    totalArticles,
    mediaSignals: allSignals,
    salienceContext,
    historicalScores,
    scopeId: reportScopeId,
    validationMaturity,
    priorQuarantine: prepared.priorQuarantine,
    reportDate: batch.reportDate,
  });

  return {
    scoredComponents: pipelineResult.scoredFull,
    signalsForScoring: pipelineResult.scoringSignals,
    oovScoringApplied: prepared.oovScoringApplied,
    pipelineResult,
  };
}

function applyAssessmentPostScoring(assessment, ctx) {
  const {
    investigationEpistemic,
    pipelineResult,
    investigationPrep,
    shadowScoring,
    batch,
    reportScopeId,
    allSignals,
    macroSignals,
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

  assessment.oov_burst = investigationPrep.oovBurst;
  if (shadowScoring?.oovScoringApplied) {
    assessment.oov_scoring_applied = shadowScoring.oovScoringApplied;
  }
  if (investigationPrep.osintChannelQuarantine) {
    const decision = investigationPrep.osintChannelQuarantine.active
      ? getSocialQuarantineDecision(batch.reportDate, reportScopeId, tryOpenValidationStore())
      : null;
    assessment.social_channel_quarantine = {
      ...investigationPrep.osintChannelQuarantine,
      ...(decision?.created_at ? { confirmed_at: decision.created_at } : {}),
    };
  }

  const patterns = detectSemanticPatterns(allSignals);
  assessment.pattern_alerts = patterns;
  assessment.operator_recommendations = buildOperatorRecommendations(patterns);

  attachInvestigationDiagnostics(assessment, {
    scoring: {
      investigationSignals: investigationPrep.investigationSignals,
      signalsForScoring: shadowScoring?.signalsForScoring ?? investigationPrep.investigationSignals,
      scopedSignals: allSignals,
      macroSignals,
      scoredFull: shadowScoring?.scoredComponents ?? null,
      scoringPartition: pipelineResult?.partition ?? null,
      scoringAssessmentMode: pipelineResult?.assessmentMode ?? null,
      assessmentMode: investigationEpistemic.assessmentMode,
    },
    investigationPlan: assessment.investigation_plan,
  });
}

function persistReportIfRequested({
  persist,
  reportWriterPort,
  outputBase,
  assessment,
  allSignals,
  sourceFiles,
}) {
  if (!persist) return;
  if (!reportWriterPort) {
    throw new Error('reportWriterPort is required when persist is true');
  }
  if (!outputBase || typeof outputBase !== 'string') {
    throw new Error('outputBase is required when persist is true');
  }
  reportWriterPort.writeReport({
    assessment,
    signals: allSignals,
    sourceFiles,
    outputBase,
  });
}

export async function runResilienceAssessment(batch, options = {}) {
  const {
    llmPort,
    reportWriterPort = null,
    dedupeTitles = false,
    onProgress,
    onUsage,
    persist = false,
    outputBase = null,
    reportSourceFiles = null,
    scope = null,
    supplementaryArticles = [],
    supplementaryContentKind = 'field_report',
  } = options;

  const reportScopeId = normalizeReportScope(scope ?? batch.scope ?? 'national');

  assertValidResilienceContentBatch(batch);
  if (!llmPort) {
    throw new Error('llmPort is required');
  }

  const pipelineStore = resolvePipelineRunStore(options);
  const pipeline = createPipelineRunTracker(pipelineStore, {
    reportDate: batch.reportDate,
    reportScopeId,
  });
  pipeline.completeStage('INGEST');
  pipeline.completeStage('NORMALIZE');

  let articles = batchItemsToArticles(batch);
  if (dedupeTitles) {
    articles = dedupeArticlesByTitle(articles);
  }

  let allSignals;
  let baseSignalsForScoring;
  let macroSignals;
  try {
    ({ allSignals, baseSignalsForScoring, macroSignals } = await extractBatchSignals({
      batch,
      articles,
      llmPort,
      supplementaryArticles,
      supplementaryContentKind,
      onUsage,
      onProgress,
      reportScopeId,
    }));
    pipeline.completeStage('EXTRACT');
  } catch (err) {
    pipeline.failStage('EXTRACT', err);
    throw err;
  }

  const reportsDir = options.reportsDir ?? 'daily_reports';
  const totalArticles = articles.length + supplementaryArticles.length;

  const investigationPrep = await prepareInvestigationSignals({
    investigationSignals: baseSignalsForScoring,
    reportDate: batch.reportDate,
    reportScopeId,
    reportsDir,
  });
  const investigationEpistemic = deriveInvestigationEpistemicContext(investigationPrep.dataVoid);

  const assessment = await produceAssessmentWithShadow({
    targetDate: batch.reportDate,
    reportScopeId,
    investigationSignals: investigationPrep.investigationSignals,
    investigationEpistemic,
    scopedSignals: allSignals,
    scopedTotalArticles: totalArticles,
    dataVoid: investigationPrep.dataVoid,
    assessmentMode: investigationEpistemic.assessmentMode,
    epistemicStatus: investigationEpistemic.epistemicStatus,
    retrievalService: options.retrievalService ?? null,
    sourceArchive: options.sourceArchive ?? null,
    evidenceStore: options.evidenceStore ?? null,
    oovBurst: investigationPrep.oovBurst,
    onUsage,
    reportsDir,
    llmPort,
    dailyBudgetExceeded: options.dailyBudgetExceeded ?? false,
  });

  pipeline.completeStage('NARRATE');

  const shadowScoring = await runShadowScoring({
    baseSignalsForScoring,
    allSignals,
    batch,
    reportScopeId,
    reportsDir,
    totalArticles,
    rootDir: options.reportsDir ?? process.cwd(),
  });
  pipeline.completeStage('SCORE');

  attachShadowDivergenceToAssessment(assessment, {
    scoredFull: shadowScoring.scoredComponents,
    reportScopeId,
    targetDate: batch.reportDate,
    reportsDir,
  });

  applyAssessmentPostScoring(assessment, {
    investigationEpistemic,
    investigationPrep,
    pipelineResult: shadowScoring.pipelineResult,
    shadowScoring,
    batch,
    reportScopeId,
    allSignals,
    macroSignals,
  });

  await attachDecisionBrief(assessment, {
    reportScopeId,
    onUsage,
  });

  const allArticles = [...articles, ...supplementaryArticles];
  const sourceFilesForReport =
    Array.isArray(reportSourceFiles) && reportSourceFiles.length > 0
      ? reportSourceFiles
      : [...new Set(allArticles.map((a) => a.sourceFile))];

  persistReportIfRequested({
    persist,
    reportWriterPort,
    outputBase,
    assessment,
    allSignals,
    sourceFiles: sourceFilesForReport,
  });
  if (persist) {
    pipeline.completeStage('PERSIST');
  }

  return {
    assessment,
    signals: allSignals,
    provenance: {
      contentKind: batch.contentKind,
      itemCount: totalArticles,
      sourceRunId: batch.sourceRunId,
      sourceLabels: uniqueSourceLabels(allArticles),
    },
  };
}

export const runAssessment = runResilienceAssessment;
