/**
 * Application use case: ResilienceContentBatch → signals → scored → assessment (+ optional persist).
 * Reuses resilience domain scoring and LLM pipeline via injected ports.
 */
import { assertValidResilienceContentBatch } from '../domain/services/resilienceBatchValidation.js';
import { mergeDualExtractionSignals } from '../infrastructure/dualModelExtract.js';
import {
  normalizeReportScope,
  reportScopeMetadata,
} from '../domain/services/regionSignalFilter.js';
import { scopeAndPartitionSignals } from './assessmentPipeline.js';
import { attachEpistemicToAssessment } from '../domain/services/dataVoidIndex.js';
import { salienceContextFromDataVoid } from '../domain/services/highSalienceBypass.js';
import { countOovCapturesForDate } from '../domain/services/oovCapture.js';
import {
  getSocialQuarantineDecision,
} from '../domain/services/socialQuarantineOverrides.js';
import { tryOpenValidationStore } from './socialQuarantineWiring.js';
import { loadHistoricalScores } from '../input/assessSignalsHelpers.js';
import { runScoringPipeline } from './scoringPipelinePrep.js';
import { prepareScoringSignals } from './prepareScoringSignals.js';
import { detectSemanticPatterns } from '../domain/services/patternDetection/semanticPatternAlerts.js';
import { buildOperatorRecommendations } from '../domain/services/patternDetection/operatorRecommendations.js';
import { attachDecisionBrief } from './attachDecisionBrief.js';
import { loadConnectivityProbeSignals } from '../infrastructure/adapters/connectivityProbeFileAdapter.js';
import { enrichProbeSignalsInList } from '../domain/services/probeCorroborationPolicy.js';
import { summarizeValidationMaturity } from '../validation/domain/validationStatus.js';
import { resolve } from 'node:path';
import { createPipelineRunStore } from '../../../db/persistence/pipelineRunStore.js';
import { createPipelineRunTracker } from './pipelineRunTracker.js';

/** Aligned with infrastructure/mdReportsLoader.js body cap */
export const MAX_BODY_CHARS = 2000;

/** Map batch items to the article shape expected by claudeEvaluator.extractSignals. */
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

/**
 * @param {object} params
 * @param {object} params.batch
 * @param {object[]} params.articles
 * @param {import('../domain/ports/IResilienceLlmPort.js').IResilienceLlmPort} params.llmPort
 * @param {object[]} [params.supplementaryArticles]
 * @param {string} [params.supplementaryContentKind]
 * @param {Function} [params.onUsage]
 * @param {Function} [params.onProgress]
 * @param {string} params.reportScopeId
 */
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

/**
 * @param {object} assessment
 * @param {object} ctx
 */
function applyAssessmentPostScoring(assessment, ctx) {
  const {
    pipelineResult,
    dataVoid,
    oovBurst,
    oovScoringApplied,
    osintChannelQuarantine,
    batch,
    reportScopeId,
    allSignals,
  } = ctx;

  attachEpistemicToAssessment(assessment, {
    dataVoid,
    epistemicStatus: pipelineResult.epistemicStatus,
    assessmentMode: pipelineResult.assessmentMode,
    staleDigitalScores: pipelineResult.staleDigitalScores,
    quarantinedDigital: pipelineResult.quarantinedDigital,
    digitalQuarantineState: pipelineResult.digitalQuarantineState,
  });

  assessment.oov_burst = oovBurst;
  if (oovScoringApplied) {
    assessment.oov_scoring_applied = oovScoringApplied;
  }
  if (osintChannelQuarantine) {
    const decision = osintChannelQuarantine.active
      ? getSocialQuarantineDecision(batch.reportDate, reportScopeId, tryOpenValidationStore())
      : null;
    assessment.social_channel_quarantine = {
      ...osintChannelQuarantine,
      ...(decision?.created_at ? { confirmed_at: decision.created_at } : {}),
    };
  }

  if (pipelineResult.epistemicEnrichment.overall_score_calibrated != null) {
    assessment.overall_score_calibrated = pipelineResult.epistemicEnrichment.overall_score_calibrated;
  }

  const patterns = detectSemanticPatterns(allSignals);
  assessment.pattern_alerts = patterns;
  assessment.operator_recommendations = buildOperatorRecommendations(patterns);
}

/**
 * @param {object} batch  ResilienceContentBatch
 * @param {object} [options]
 * @param {import('../domain/ports/IResilienceLlmPort.js').IResilienceLlmPort} [options.llmPort]
 * @param {import('../domain/ports/IResilienceReportWriterPort.js').IResilienceReportWriterPort} [options.reportWriterPort]
 * @param {boolean} [options.dedupeTitles]
 * @param {(e: object) => void} [options.onProgress]
 * @param {(e: object) => void} [options.onUsage]
 * @param {boolean} [options.persist]
 * @param {string} [options.outputBase]  Path without extension when persist is true
 * @param {string[]} [options.reportSourceFiles]  Basenames for report header (e.g. articles-homefront.md); default from batch items
 */
/**
 * Scoring phase: prepare signals (data-void / quarantine / OOV), then run the
 * scoring pipeline. Returns the scored components plus the side-channel state
 * the downstream narrative/post-scoring steps consume.
 */
async function scoreBatchSignals({
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
    dataVoid: prepared.dataVoid,
    osintChannelQuarantine: prepared.osintChannelQuarantine,
    oovBurst: prepared.oovBurst,
    oovScoringApplied: prepared.oovScoringApplied,
    pipelineResult,
  };
}

/**
 * Persistence phase: write the report via the writer port when persist is on.
 * Validates required options, mirroring the previous inline guard.
 */
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
    // Optional supplementary articles (e.g. field reports) extracted with a different content kind
    supplementaryArticles = [],
    supplementaryContentKind = 'field_report',
  } = options;

  const reportScopeId = normalizeReportScope(scope ?? batch.scope ?? 'national');
  const reportScope = reportScopeMetadata(reportScopeId);

  assertValidResilienceContentBatch(batch);
  if (!llmPort) {
    throw new Error('llmPort is required');
  }

  const pipelineStore = options.pipelineRunStore ?? (process.env.PIPELINE_RUN_TRACKING === '0'
    ? null
    : createPipelineRunStore(
      process.env.SQLITE_PATH?.trim()
        ? resolve(process.env.SQLITE_PATH.trim())
        : resolve(process.cwd(), 'db', 'app.sqlite'),
    ));
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
  const narrativeContentKind = supplementaryArticles.length > 0 ? 'mixed' : batch.contentKind;

  const {
    scoredComponents,
    signalsForScoring,
    dataVoid,
    osintChannelQuarantine,
    oovBurst,
    oovScoringApplied,
    pipelineResult,
  } = await scoreBatchSignals({
    baseSignalsForScoring,
    allSignals,
    batch,
    reportScopeId,
    reportsDir,
    totalArticles,
    rootDir: options.reportsDir ?? process.cwd(),
  });
  pipeline.completeStage('SCORE');

  const oovCaptureCount = countOovCapturesForDate(batch.reportDate);
  const assessment = await llmPort.generateNarratives(
    scoredComponents,
    signalsForScoring,
    batch.reportDate,
    totalArticles,
    {
      onUsage,
      onProgress,
      priorReports: batch.priorAssessments ?? [],
      contentKind: narrativeContentKind,
      reportScope,
      macroSignals,
      allScopedSignals: allSignals,
      dataVoid,
      oovCaptureCount,
      socialChannelQuarantine: osintChannelQuarantine,
      quarantinedDigital: pipelineResult.quarantinedDigital,
    },
  );

  pipeline.completeStage('NARRATE');

  applyAssessmentPostScoring(assessment, {
    pipelineResult,
    dataVoid,
    oovBurst,
    oovScoringApplied,
    osintChannelQuarantine,
    batch,
    reportScopeId,
    allSignals,
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

/** Spec alias */
export const runAssessment = runResilienceAssessment;
