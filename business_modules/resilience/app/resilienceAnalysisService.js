/**
 * Application use case: ResilienceContentBatch → signals → scored → assessment (+ optional persist).
 * Reuses resilience domain scoring and LLM pipeline via injected ports.
 */
import { assertValidResilienceContentBatch } from '../domain/services/resilienceBatchValidation.js';
import { scoreComponents } from '../domain/services/resilienceScoring.js';
import { mergeDualExtractionSignals } from '../infrastructure/dualModelExtract.js';
import {
  filterSignalsForScope,
  normalizeReportScope,
  reportScopeMetadata,
} from '../domain/services/regionSignalFilter.js';
import {
  annotateSignalsEpistemics,
  partitionMacroSignals,
} from '../domain/services/evidenceEligibility.js';
import { computeDataVoidIndex, applyEpistemicGate, attachEpistemicToAssessment } from '../domain/services/dataVoidIndex.js';
import { salienceContextFromDataVoid } from '../domain/services/highSalienceBypass.js';
import { countOovCapturesForDate } from '../domain/services/oovCapture.js';
import { loadHistoricalSignalDays } from '../input/assessSignalsHelpers.js';
import { loadConnectivityProbeSignals } from '../infrastructure/adapters/connectivityProbeFileAdapter.js';

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

  let articles = batchItemsToArticles(batch);
  if (dedupeTitles) {
    articles = dedupeArticlesByTitle(articles);
  }

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
    allSignals = mergeDualExtractionSignals(allSignals, pass2);
  }

  // Extract signals from supplementary batch (field reports) separately using their own prompt
  if (supplementaryArticles.length > 0) {
    const suppOpts = { onUsage, onProgress, contentKind: supplementaryContentKind };
    const suppSignals = await llmPort.extractSignals(supplementaryArticles, suppOpts);
    allSignals = [...allSignals, ...suppSignals];
  }

  const probeSignals = loadConnectivityProbeSignals(batch.reportDate, reportScopeId);
  if (probeSignals.length > 0) {
    allSignals = [...allSignals, ...probeSignals];
  }

  allSignals = filterSignalsForScope(allSignals, reportScopeId);
  allSignals = annotateSignalsEpistemics(allSignals, { reportScope: reportScopeId });
  const { metricsSignals, macroSignals } = partitionMacroSignals(allSignals, reportScopeId);
  const signalsForScoring = reportScopeId === 'north' ? metricsSignals : allSignals;

  const totalArticles = articles.length + supplementaryArticles.length;
  const narrativeContentKind = supplementaryArticles.length > 0 ? 'mixed' : batch.contentKind;

  const reportsDir = options.reportsDir ?? 'reports';
  const historicalSignalDays = loadHistoricalSignalDays(
    batch.reportDate,
    reportsDir,
    7,
    reportScopeId,
  );
  const dataVoid = computeDataVoidIndex(signalsForScoring, historicalSignalDays, {
    reportScope: reportScopeId,
  });

  let salienceContext = salienceContextFromDataVoid(dataVoid);
  const digitalInclusiveScored = scoreComponents(signalsForScoring, {
    totalArticles,
    mediaSignals: allSignals,
    salienceContext,
  });

  const gateResult = applyEpistemicGate({
    scoredFull: digitalInclusiveScored,
    signalsForScoring,
    dataVoid,
    totalArticles,
    mediaSignals: allSignals,
    salienceContext,
    digitalInclusiveScored,
  });

  const scoredComponents = gateResult.scoredFull;
  salienceContext = gateResult.salienceContext;
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
    },
  );

  attachEpistemicToAssessment(assessment, {
    dataVoid,
    epistemicStatus: gateResult.epistemicStatus,
    assessmentMode: gateResult.assessmentMode,
    staleDigitalScores: gateResult.staleDigitalScores,
  });

  const allArticles = [...articles, ...supplementaryArticles];
  const sourceFilesForReport =
    Array.isArray(reportSourceFiles) && reportSourceFiles.length > 0
      ? reportSourceFiles
      : [...new Set(allArticles.map((a) => a.sourceFile))];

  if (persist) {
    if (!reportWriterPort) {
      throw new Error('reportWriterPort is required when persist is true');
    }
    if (!outputBase || typeof outputBase !== 'string') {
      throw new Error('outputBase is required when persist is true');
    }
    reportWriterPort.writeReport({
      assessment,
      signals: allSignals,
      sourceFiles: sourceFilesForReport,
      outputBase,
    });
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
