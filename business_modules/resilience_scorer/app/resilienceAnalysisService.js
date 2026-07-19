/**
 * Application use case: ResilienceContentBatch → signals → investigation → optional shadow score.
 */
import { assertValidResilienceContentBatch } from '../domain/services/signals/resilienceBatchValidation.js';
import { mergeDualExtractionSignals } from '../infrastructure/dualModelExtract.js';
import {
  normalizeReportScope,
} from '../domain/services/signals/regionSignalFilter.js';
import { loadConnectivityProbeSignals } from '../infrastructure/adapters/connectivityProbeFileAdapter.js';
import { enrichProbeSignalsInList } from '../domain/services/signals/probeCorroborationPolicy.js';
import { resilienceReportsDir } from '../domain/services/paths/outputDirs.js';
import { enrichSignalsGeoIfNeeded } from '../../../cross-cut-modules/geo/enrichSignalsGeoIfNeeded.js';
import { runPostExtractionAssessmentCore } from './assessment/assessmentStage.js';
import { buildAssessmentWindowMetadata } from './assessment/assessSignalsHelpers.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPipelineRunStore } from '../../../db/persistence/pipelineRunStore.js';
import { resolveSqlitePath } from '../../../cross-cut-modules/config/sqlitePath.js';
import { createPipelineRunTracker } from './pipeline/pipelineRunTracker.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export { MAX_BODY_CHARS } from './extraction/contentBatchFromMdArticles.js';
import { MAX_BODY_CHARS } from './extraction/contentBatchFromMdArticles.js';

function resolvePipelineRunStore(options) {
  if (options.pipelineRunStore !== undefined) {
    return options.pipelineRunStore;
  }
  if (process.env.PIPELINE_RUN_TRACKING === '0') {
    return null;
  }
  return createPipelineRunStore(resolveSqlitePath());
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
  allSignals = enrichSignalsGeoIfNeeded(allSignals, {
    rootDir: REPO_ROOT,
    unknownSourceType: 'server-assessment',
    logPrefix: 'Geo attach',
  });
  return { allSignals };
}

function persistReportIfRequested({
  persist,
  reportWriterPort,
  outputBase,
  assessment,
  allSignals,
  sourceFiles,
  assessmentDays = 1,
  pipelinePreset = null,
}) {
  if (!persist) return;
  if (!reportWriterPort) {
    throw new Error('reportWriterPort is required when persist is true');
  }
  if (!outputBase || typeof outputBase !== 'string') {
    throw new Error('outputBase is required when persist is true');
  }
  const reportDate = assessment?.date ?? null;
  const assessmentWindow = reportDate
    ? buildAssessmentWindowMetadata(reportDate, assessmentDays, { pipelinePreset })
    : null;
  reportWriterPort.writeReport({
    assessment,
    signals: allSignals,
    sourceFiles,
    outputBase,
    assessmentWindow,
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
    assessmentDays = 1,
    pipelinePreset = null,
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
  try {
    ({ allSignals } = await extractBatchSignals({
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

  const reportsDir = options.reportsDir ?? resilienceReportsDir(options.rootDir);
  const totalArticles = articles.length + supplementaryArticles.length;

  let coreResult;
  try {
    coreResult = await runPostExtractionAssessmentCore({
      allSignals,
      reportScopeId,
      reportDate: batch.reportDate,
      totalArticles,
      reportsDir,
      onUsage,
      llmPort,
      retrievalService: options.retrievalService ?? null,
      sourceArchive: options.sourceArchive ?? null,
      evidenceStore: options.evidenceStore ?? null,
      dailyBudgetExceeded: options.dailyBudgetExceeded ?? false,
      rootDir: options.reportsDir ?? process.cwd(),
      onScoreComplete: () => pipeline.completeStage('SCORE'),
      onNarrateComplete: () => pipeline.completeStage('NARRATE'),
      attachDecisionBrief: true,
      assessmentDays,
    });
  } catch (err) {
    pipeline.failStage('SCORE', err);
    throw err;
  }

  const { assessment, scopedSignals } = coreResult;
  allSignals = scopedSignals;

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
    assessmentDays,
    pipelinePreset,
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
