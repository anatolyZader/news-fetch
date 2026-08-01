/**
 * Evidence submission queue: URL/file ingest, manual storage, and LLM analysis.
 */

import { mkdir } from 'node:fs/promises';
import { basename, extname, resolve, sep } from 'node:path';
import { getTodayInTimezone } from '../../../utils/dateUtils.js';
import {
  runResilienceAssessment,
  contentBatchFromMdArticles,
  createAnthropicResilienceLlmAdapter,
  normalizeReportScope,
} from '../../resilience_scorer/index.js';
import { persistOriginalSources } from '../../../db/source_archive/persistOriginals.js';
import { createUrlReputationChecker } from '../../../cross-cut-modules/security/index.js';
import {
  buildExtractedContentReview,
  classifyLocalEvidenceFile,
  classifyUrlKind,
  extractUrls,
  isPathUnderUploadRoot,
  toAnalysisArticle,
  webPageToEvidenceItem,
} from './submissionHelpers.js';
import { EVENT_TYPES, publishDomainEvent } from '../../../cross-cut-modules/messaging/index.js';

const DEFAULT_JOB_TIMEOUT_MS = 20 * 60 * 1000;

function archivePersistItems(sourceArchive, evidenceStore, items) {
  if (!sourceArchive || items.length === 0) return 0;
  return persistOriginalSources(sourceArchive, items, { evidenceStore }).archived;
}

async function ingestUrlByKind({
  url,
  kind,
  reportDate,
  ingestService,
  youtubeEvidenceIngestService,
  videoGrabService,
  videoDownloadDir,
  sourceArchive,
  evidenceStore,
  autoIngest,
  analysisEvidenceItems,
}) {
  if (kind === 'audio_download_url') {
    const items = await ingestService.ingestAudioUrlToEvidenceItems({ url, date: reportDate });
    if (items.length > 0) {
      autoIngest.insertedItems += archivePersistItems(sourceArchive, evidenceStore, items);
      analysisEvidenceItems.push(...items);
    }
    return;
  }
  if (kind === 'youtube_url') {
    await mkdir(videoDownloadDir, { recursive: true });
    const result = await youtubeEvidenceIngestService.ingestYoutubeUrlToEvidenceItems({
      url,
      date: reportDate,
      outputDir: videoDownloadDir,
      onUsage: undefined,
    });
    const items = result.items;
    if (items.length > 0) {
      autoIngest.insertedItems += archivePersistItems(sourceArchive, evidenceStore, items);
      analysisEvidenceItems.push(...items);
    }
    return;
  }
  if (kind === 'video_download_url') {
    await mkdir(videoDownloadDir, { recursive: true });
    const dl = await videoGrabService.downloadFromUrl(url, videoDownloadDir);
    if (!dl?.ok || !dl?.outputPath) {
      throw new Error(dl?.error || 'video download failed');
    }
    const items = await ingestService.ingestAudioFileToEvidenceItems({
      filePath: dl.outputPath,
      date: reportDate,
      sourceUrl: url,
      sourceLabel: 'video-download-url',
    });
    if (items.length > 0) {
      autoIngest.insertedItems += archivePersistItems(sourceArchive, evidenceStore, items);
      analysisEvidenceItems.push(...items);
    }
    return;
  }
  const item = await webPageToEvidenceItem(url, reportDate);
  autoIngest.insertedItems += archivePersistItems(sourceArchive, evidenceStore, [item]);
  analysisEvidenceItems.push(item);
}

async function ingestUrls(content, ctx) {
  const urls = extractUrls(content);
  if (urls.length === 0) return;
  ctx.autoIngest.attempted = true;
  const reputations = await ctx.urlReputation.checkUrls(urls);
  for (const url of urls) {
    const reputation = reputations.get(url);
    if (reputation?.status === 'flagged') {
      ctx.autoIngest.errors.push(`${url}: blocked by Safe Browsing (${reputation.threatType})`);
      continue;
    }
    const kind = classifyUrlKind(url);
    ctx.autoIngest.kinds.push({ url, kind });
    try {
      await ingestUrlByKind({ url, kind, ...ctx });
    } catch (err) {
      ctx.autoIngest.errors.push(`${url}: ${err?.message ?? 'ingest failed'}`);
    }
  }
}

async function ingestLocalFiles(localFilePaths, ctx) {
  for (const filePath of localFilePaths) {
    if (!isPathUnderUploadRoot(filePath, ctx.evidenceUserUploadsRoot, resolve, sep)) {
      ctx.autoIngest.errors.push(`${filePath}: invalid storage path`);
      continue;
    }
    const kind = classifyLocalEvidenceFile(filePath, extname);
    if (kind === 'unsupported') {
      ctx.autoIngest.errors.push(
        `${basename(filePath)}: unsupported type (upload .mp3/.m4a/.wav… or .mp4/.webm/… video)`,
      );
      continue;
    }
    ctx.autoIngest.attempted = true;
    try {
      const label = kind === 'video' ? 'user-upload-video' : 'user-upload-audio';
      const items = await ctx.ingestService.ingestAudioFileToEvidenceItems({
        filePath,
        date: ctx.reportDate,
        sourceUrl: '',
        sourceLabel: label,
      });
      if (items.length > 0) {
        ctx.autoIngest.insertedItems += archivePersistItems(
          ctx.sourceArchive,
          ctx.evidenceStore,
          items,
        );
        ctx.analysisEvidenceItems.push(...items);
      }
    } catch (err) {
      ctx.autoIngest.errors.push(`${basename(filePath)}: ${err?.message ?? 'ingest failed'}`);
    }
  }
}

async function storeManualEvidence(content, ctx) {
  const manualItem = {
    date: ctx.reportDate,
    source_type: 'manual',
    source_label: 'manual-input',
    source_url: '',
    title: 'Manual evidence submission',
    body: content,
    published_at: ctx.reportDate,
  };
  archivePersistItems(ctx.sourceArchive, ctx.evidenceStore, [manualItem]);
  ctx.evidenceDraftStore.setSubmissionAnalysisResult({
    submissionId: ctx.submissionId,
    ownerKey: ctx.ownerKey,
    status: 'processed',
    details: 'stored as evidence; no LLM analysis for single text items',
    analysisJson: null,
  });
}

async function runSubmissionAnalysis(ctx, deps) {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }
  const sourceTypes = [...new Set(ctx.analysisEvidenceItems.map((i) => i.source_type))];
  const contentKind = sourceTypes.length === 1 && sourceTypes[0] === 'audio' ? 'audio' : 'news';
  const analysisArticles = ctx.analysisEvidenceItems.map((item, idx) =>
    toAnalysisArticle(item, idx, `submission:${ctx.submissionId}`),
  );
  const batch = deps.contentBatchFromMdArticles(analysisArticles, {
    reportDate: ctx.reportDate,
    contentKind,
    sourceRunId: `submission:${ctx.submissionId}`,
  });
  const llmPort = deps.createAnthropicResilienceLlmAdapter();
  return deps.runResilienceAssessment(batch, {
    llmPort,
    dedupeTitles: true,
    persist: false,
    scope: ctx.reportScopeId,
  });
}

async function processSubmissionJob(deps, {
  submissionId,
  ownerKey,
  content,
  localFilePaths = [],
  allowLlmAnalysis = false,
  reportScopeId = 'national',
}) {
  const autoIngest = { attempted: false, insertedItems: 0, errors: [], kinds: [] };
  const analysisEvidenceItems = [];
  const safeLocalPaths = Array.isArray(localFilePaths) ? localFilePaths : [];
  const reportDate = getTodayInTimezone(deps.timezone);
  const ingestService = deps.getAudioEvidenceIngestService();

  const ctx = {
    submissionId,
    ownerKey,
    autoIngest,
    analysisEvidenceItems,
    reportDate,
    reportScopeId: normalizeReportScope(reportScopeId),
    ingestService,
    evidenceStore: deps.evidenceStore,
    sourceArchive: deps.sourceArchive,
    evidenceDraftStore: deps.evidenceDraftStore,
    youtubeEvidenceIngestService: deps.youtubeEvidenceIngestService,
    videoGrabService: deps.videoGrabService,
    videoDownloadDir: deps.videoDownloadDir,
    evidenceUserUploadsRoot: deps.evidenceUserUploadsRoot,
    urlReputation: deps.urlReputation,
  };

  await ingestUrls(content, ctx);
  await ingestLocalFiles(safeLocalPaths, ctx);

  const sourceCount = extractUrls(content).length + safeLocalPaths.length;
  const ingestFailed = sourceCount > 0 && autoIngest.insertedItems === 0;

  deps.evidenceDraftStore.setSubmissionIngestStatus({
    submissionId,
    ownerKey,
    status: ingestFailed ? 'failed' : 'processed',
    details:
      autoIngest.errors.length > 0
        ? autoIngest.errors.join(' | ').slice(0, 4000)
        : `inserted=${autoIngest.insertedItems}`,
  });

  if (analysisEvidenceItems.length === 0) {
    await storeManualEvidence(content, ctx);
    return;
  }

  deps.evidenceDraftStore.setSubmissionExtractedContent({
    submissionId,
    ownerKey,
    extractedContentJson: buildExtractedContentReview(analysisEvidenceItems, autoIngest),
  });

  if (!allowLlmAnalysis) {
    deps.evidenceDraftStore.setSubmissionAnalysisResult({
      submissionId,
      ownerKey,
      status: 'processed',
      details: 'ingested without LLM analysis (maintainer or quota required)',
      analysisJson: null,
    });
    return;
  }

  try {
    const result = await runSubmissionAnalysis(ctx, deps);
    deps.evidenceDraftStore.setSubmissionAnalysisResult({
      submissionId,
      ownerKey,
      status: 'processed',
      details: `signals=${result.signals.length}; items=${ctx.analysisEvidenceItems.length}`,
      analysisJson: result.assessment,
    });
    await publishDomainEvent({
      eventType: EVENT_TYPES.EVIDENCE_SUBMISSION_COMPLETED,
      payload: { submissionId, ownerKey, status: 'completed' },
      outbox: deps.outboxStore ?? null,
      bus: deps.eventBus ?? null,
    });
  } catch (err) {
    deps.evidenceDraftStore.setSubmissionAnalysisResult({
      submissionId,
      ownerKey,
      status: 'failed',
      details: (err?.message ?? 'submission analysis failed').slice(0, 4000),
      analysisJson: null,
    });
    try {
      await publishDomainEvent({
        eventType: EVENT_TYPES.EVIDENCE_SUBMISSION_COMPLETED,
        payload: { submissionId, ownerKey, status: 'failed' },
        outbox: deps.outboxStore ?? null,
        bus: deps.eventBus ?? null,
      });
    } catch {
      /* non-fatal */
    }
  }
}

/**
 * @param {object} opts
 * @param {import('../../../cross-cut-modules/persistence/evidenceDraftStore.js').EvidenceDraftStore} opts.evidenceDraftStore
 * @param {object} opts.evidenceStore
 * @param {object} [opts.sourceArchive]
 * @param {() => import('../../audio/app/audioEvidenceIngestService.js').AudioEvidenceIngestService} opts.getAudioEvidenceIngestService
 * @param {object} opts.youtubeEvidenceIngestService
 * @param {object} opts.videoGrabService
 * @param {string} opts.videoDownloadDir
 * @param {string} opts.evidenceUserUploadsRoot
 * @param {string} [opts.timezone]
 * @param {number} [opts.jobTimeoutMs]
 * @param {{ checkUrls: (urls: string[]) => Promise<Map<string, object>> }} [opts.urlReputation]
 */
export function createEvidenceSubmissionService(opts) {
  const deps = {
    evidenceDraftStore: opts.evidenceDraftStore,
    evidenceStore: opts.evidenceStore,
    sourceArchive: opts.sourceArchive,
    getAudioEvidenceIngestService: opts.getAudioEvidenceIngestService,
    youtubeEvidenceIngestService: opts.youtubeEvidenceIngestService,
    videoGrabService: opts.videoGrabService,
    videoDownloadDir: opts.videoDownloadDir,
    evidenceUserUploadsRoot: opts.evidenceUserUploadsRoot,
    timezone: opts.timezone ?? (process.env.TZ_ARTICLES || 'Asia/Jerusalem'),
    jobTimeoutMs: opts.jobTimeoutMs ?? DEFAULT_JOB_TIMEOUT_MS,
    runResilienceAssessment: opts.runResilienceAssessment ?? runResilienceAssessment,
    contentBatchFromMdArticles: opts.contentBatchFromMdArticles ?? contentBatchFromMdArticles,
    createAnthropicResilienceLlmAdapter:
      opts.createAnthropicResilienceLlmAdapter ?? createAnthropicResilienceLlmAdapter,
    outboxStore: opts.outboxStore ?? null,
    eventBus: opts.eventBus ?? null,
    urlReputation: opts.urlReputation ?? createUrlReputationChecker(),
  };

  const submissionQueue = [];
  let processingSubmissionQueue = false;

  async function drainSubmissionQueue() {
    if (processingSubmissionQueue) return;
    processingSubmissionQueue = true;
    try {
      while (submissionQueue.length > 0) {
        const job = submissionQueue.shift();
        try {
          await Promise.race([
            processSubmissionJob(deps, job),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('submission job timed out after 20 minutes')),
                deps.jobTimeoutMs,
              ),
            ),
          ]);
        } catch (err) {
          deps.evidenceDraftStore.setSubmissionIngestStatus({
            submissionId: job.submissionId,
            ownerKey: job.ownerKey,
            status: 'failed',
            details: (err?.message ?? 'submission processing failed').slice(0, 4000),
          });
          deps.evidenceDraftStore.setSubmissionAnalysisResult({
            submissionId: job.submissionId,
            ownerKey: job.ownerKey,
            status: 'failed',
            details: 'Skipped because ingest failed unexpectedly',
            analysisJson: null,
          });
        }
      }
    } finally {
      processingSubmissionQueue = false;
    }
  }

  function enqueue(job) {
    submissionQueue.push(job);
    setTimeout(() => {
      void drainSubmissionQueue();
    }, 0);
  }

  return { enqueue };
}
