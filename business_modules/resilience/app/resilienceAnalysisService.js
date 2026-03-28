/**
 * Application use case: ResilienceContentBatch → signals → scored → assessment (+ optional persist).
 * Reuses resilience domain scoring and LLM pipeline via injected ports.
 */
import { assertValidResilienceContentBatch } from '../domain/services/resilienceBatchValidation.js';
import { scoreComponents } from '../domain/services/resilienceScoring.js';

/** Aligned with infrastructure/mdReportsLoader.js body cap */
export const MAX_BODY_CHARS = 2000;

/** Map batch items to the article shape expected by claudeEvaluator.extractSignals. */
function batchItemsToArticles(batch) {
  const sourceFile = batch.sourceRunId != null ? String(batch.sourceRunId) : 'content-batch';
  return batch.items.map((item) => ({
    title: item.title,
    url: item.url ?? '',
    publishedAt: item.publishedAt ?? '',
    source: item.sourceLabel ?? 'batch',
    body: item.body.slice(0, MAX_BODY_CHARS),
    sourceFile,
    temporal_weight: item.temporal_weight ?? 1.0,
  }));
}

function dedupeArticlesByTitle(articles) {
  const seen = new Set();
  return articles.filter((a) => {
    const key = a.title.replace(/[^\u0590-\u05FF\w]/g, '').slice(0, 40);
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
  } = options;

  assertValidResilienceContentBatch(batch);
  if (!llmPort) {
    throw new Error('llmPort is required');
  }

  let articles = batchItemsToArticles(batch);
  if (dedupeTitles) {
    articles = dedupeArticlesByTitle(articles);
  }

  const llmOpts = { onUsage, onProgress, contentKind: batch.contentKind };
  const signals = await llmPort.extractSignals(articles, llmOpts);
  const scoredComponents = scoreComponents(signals, { totalArticles: articles.length });
  const assessment = await llmPort.generateNarratives(
    scoredComponents,
    signals,
    batch.reportDate,
    articles.length,
    {
      onUsage,
      onProgress,
      priorReports: batch.priorAssessments ?? [],
      contentKind: batch.contentKind,
    },
  );

  const sourceFilesForReport =
    Array.isArray(reportSourceFiles) && reportSourceFiles.length > 0
      ? reportSourceFiles
      : [...new Set(articles.map((a) => a.sourceFile))];

  if (persist) {
    if (!reportWriterPort) {
      throw new Error('reportWriterPort is required when persist is true');
    }
    if (!outputBase || typeof outputBase !== 'string') {
      throw new Error('outputBase is required when persist is true');
    }
    reportWriterPort.writeReport({
      assessment,
      signals,
      sourceFiles: sourceFilesForReport,
      outputBase,
    });
  }

  return {
    assessment,
    signals,
    provenance: {
      contentKind: batch.contentKind,
      itemCount: articles.length,
      sourceRunId: batch.sourceRunId,
      sourceLabels: uniqueSourceLabels(articles),
    },
  };
}

/** Spec alias */
export const runAssessment = runResilienceAssessment;
