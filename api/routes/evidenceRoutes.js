/**
 * Evidence submission queue and ingest routes.
 */

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, basename, extname, sep, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomBytes } from 'node:crypto';
import { getTodayInTimezone } from '../../utils/dateUtils.js';
import { classifyEvidenceInput } from '../../cross-cut-modules/evidence/evidenceInputClassifier.js';
import { runResilienceAssessment } from '../../business_modules/resilience/app/resilienceAnalysisService.js';
import { contentBatchFromMdArticles } from '../../business_modules/resilience/app/contentBatchFromMdArticles.js';
import { createAnthropicResilienceLlmAdapter } from '../../business_modules/resilience/infrastructure/adapters/anthropicResilienceLlmAdapter.js';
import {
  buildExtractedContentReview,
  classifyLocalEvidenceFile,
  classifyUrlKind,
  extractUrls,
  isPathUnderUploadRoot,
  multipartFieldValue,
  toAnalysisArticle,
  webPageToEvidenceItem,
} from './submissionHelpers.js';
import { persistOriginalSources } from '../../cross-cut-modules/source_archive/persistOriginals.js';
import { auditFromRequest } from '../../cross-cut-modules/security/input/auditLog.js';
import { costlyRoutePreHandlers } from '../../cross-cut-modules/security/input/costlyRoutePreHandlers.js';
import {
  canRunEvidenceLlmAnalysis,
  recordEvidenceLlmAnalysis,
} from './evidenceAnalysisAccess.js';

const SUBMISSION_JOB_TIMEOUT_MS = 20 * 60 * 1000;

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
  for (const url of urls) {
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

async function runSubmissionAnalysis(ctx) {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }
  const sourceTypes = [...new Set(ctx.analysisEvidenceItems.map((i) => i.source_type))];
  const contentKind = sourceTypes.length === 1 && sourceTypes[0] === 'audio' ? 'audio' : 'news';
  const analysisArticles = ctx.analysisEvidenceItems.map((item, idx) =>
    toAnalysisArticle(item, idx, `submission:${ctx.submissionId}`),
  );
  const batch = contentBatchFromMdArticles(analysisArticles, {
    reportDate: ctx.reportDate,
    contentKind,
    sourceRunId: `submission:${ctx.submissionId}`,
  });
  const llmPort = createAnthropicResilienceLlmAdapter();
  return runResilienceAssessment(batch, {
    llmPort,
    dedupeTitles: true,
    persist: false,
  });
}

async function processSubmissionJob(deps, { submissionId, ownerKey, content, localFilePaths = [], allowLlmAnalysis = false }) {
  const autoIngest = { attempted: false, insertedItems: 0, errors: [], kinds: [] };
  const analysisEvidenceItems = [];
  const safeLocalPaths = Array.isArray(localFilePaths) ? localFilePaths : [];
  const reportDate = getTodayInTimezone(process.env.TZ_ARTICLES || 'Asia/Jerusalem');
  const ingestService = deps.getAudioEvidenceIngestService();

  const ctx = {
    submissionId,
    ownerKey,
    autoIngest,
    analysisEvidenceItems,
    reportDate,
    ingestService,
    evidenceStore: deps.evidenceStore,
    sourceArchive: deps.sourceArchive,
    evidenceDraftStore: deps.evidenceDraftStore,
    youtubeEvidenceIngestService: deps.youtubeEvidenceIngestService,
    videoGrabService: deps.videoGrabService,
    videoDownloadDir: deps.videoDownloadDir,
    evidenceUserUploadsRoot: deps.evidenceUserUploadsRoot,
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
    const result = await runSubmissionAnalysis(ctx);
    deps.evidenceDraftStore.setSubmissionAnalysisResult({
      submissionId,
      ownerKey,
      status: 'processed',
      details: `signals=${result.signals.length}; items=${ctx.analysisEvidenceItems.length}`,
      analysisJson: result.assessment,
    });
  } catch (err) {
    deps.evidenceDraftStore.setSubmissionAnalysisResult({
      submissionId,
      ownerKey,
      status: 'failed',
      details: (err?.message ?? 'submission analysis failed').slice(0, 4000),
      analysisJson: null,
    });
  }
}

function createSubmissionQueue(deps) {
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
                SUBMISSION_JOB_TIMEOUT_MS,
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

  function enqueueSubmissionJob(job) {
    submissionQueue.push(job);
    setTimeout(() => {
      void drainSubmissionQueue();
    }, 0);
  }

  return { enqueueSubmissionJob };
}

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {object} opts
 */
export async function evidenceRoutes(app, opts) {
  const {
    authHook,
    evidenceDraftStore,
    evidenceStore,
    sourceArchive,
    maxEvidenceDraftChars,
    evidenceUserUploadsRoot,
    videoDownloadDir,
    videoGrabService,
    youtubeEvidenceIngestService,
    getAudioEvidenceIngestService,
    evidenceOwnerKey,
  } = opts;

  const { enqueueSubmissionJob } = createSubmissionQueue({
    evidenceDraftStore,
    evidenceStore,
    sourceArchive,
    videoDownloadDir,
    videoGrabService,
    youtubeEvidenceIngestService,
    getAudioEvidenceIngestService,
    evidenceUserUploadsRoot,
  });

  app.get('/api/evidence-draft', authHook, async (request, reply) => {
    const row = evidenceDraftStore.get(evidenceOwnerKey(request));
    return reply.send({ content: row.content, updatedAt: row.updatedAt });
  });

  app.put('/api/evidence-draft', authHook, async (request, reply) => {
    const body = request.body ?? {};
    const content = body.content;
    if (typeof content !== 'string') {
      return reply.code(400).send({ error: 'content must be a string' });
    }
    if (content.length > maxEvidenceDraftChars) {
      return reply.code(400).send({
        error: `content too long (max ${maxEvidenceDraftChars} characters)`,
      });
    }
    const row = evidenceDraftStore.save(evidenceOwnerKey(request), content);
    return reply.send({ content: row.content, updatedAt: row.updatedAt });
  });

  app.post('/api/evidence-submit', costlyRoutePreHandlers(authHook.preHandler ? [authHook.preHandler] : []), async (request, reply) => {
    const body = request.body ?? {};
    const content = body.content;
    if (typeof content !== 'string') {
      return reply.code(400).send({ error: 'content must be a string' });
    }
    if (content.length > maxEvidenceDraftChars) {
      return reply.code(400).send({
        error: `content too long (max ${maxEvidenceDraftChars} characters)`,
      });
    }
    if (content.trim().length === 0) {
      return reply.code(400).send({ error: 'content must not be empty' });
    }

    const ownerKey = evidenceOwnerKey(request);
    const classification = classifyEvidenceInput(content);
    const savedDraft = evidenceDraftStore.save(ownerKey, content);
    const submission = evidenceDraftStore.submit(
      ownerKey,
      content,
      classification.category,
      classification.detectedUrl,
    );
    const allowLlmAnalysis = canRunEvidenceLlmAnalysis(request, evidenceDraftStore);
    if (allowLlmAnalysis) {
      recordEvidenceLlmAnalysis(request, evidenceDraftStore);
    }
    enqueueSubmissionJob({
      submissionId: submission.id,
      ownerKey,
      content,
      localFilePaths: [],
      allowLlmAnalysis,
    });

    auditFromRequest(request, 'evidence.submit', '/api/evidence-submit', {
      submissionId: submission.id,
      allowLlmAnalysis,
    });

    return reply.code(202).send({
      submission,
      draft: { content: savedDraft.content, updatedAt: savedDraft.updatedAt },
      queued: true,
    });
  });

  app.post('/api/evidence-upload', costlyRoutePreHandlers(authHook.preHandler ? [authHook.preHandler] : []), async (request, reply) => {
    if (!request.isMultipart()) {
      return reply.code(400).send({
        error: 'use multipart/form-data with field "content" and optional file fields "files"',
      });
    }
    const ownerKey = evidenceOwnerKey(request);
    let textContent = '';
    const savedPaths = [];
    const batchId = randomBytes(12).toString('hex');
    const batchDir = join(evidenceUserUploadsRoot, ownerKey, batchId);
    await mkdir(batchDir, { recursive: true });

    try {
      for await (const part of request.parts()) {
        if (part.type === 'file' && (part.fieldname === 'files' || part.fieldname === 'file')) {
          const rawName = part.filename || 'upload.bin';
          const safe = basename(rawName).replaceAll(/[^a-zA-Z0-9._-]/g, '_') || 'file';
          const dest = join(batchDir, `${savedPaths.length}-${safe}`);
          await pipeline(part.file, createWriteStream(dest));
          savedPaths.push(dest);
        } else if (part.type === 'field' && part.fieldname === 'content') {
          textContent = multipartFieldValue(part);
        }
      }
    } catch (err) {
      return reply.code(400).send({ error: err?.message || 'upload failed' });
    }

    if (!textContent.trim() && savedPaths.length === 0) {
      return reply.code(400).send({ error: 'Add text/URLs and/or at least one file' });
    }

    const contentForStore =
      textContent.trim() ||
      (savedPaths.length ? `[File upload: ${savedPaths.length} file(s)]` : '');
    if (contentForStore.length > maxEvidenceDraftChars) {
      return reply.code(400).send({ error: `content too long (max ${maxEvidenceDraftChars} characters)` });
    }

    const classification = classifyEvidenceInput(textContent.trim() || 'upload');
    const savedDraft = evidenceDraftStore.save(ownerKey, textContent.trim() || contentForStore);
    const submission = evidenceDraftStore.submit(
      ownerKey,
      contentForStore,
      classification.category,
      classification.detectedUrl,
    );
    const jobText = textContent.trim() || (savedPaths.length ? `[File upload: ${savedPaths.length} file(s)]` : ' ');
    const allowLlmAnalysis = canRunEvidenceLlmAnalysis(request, evidenceDraftStore);
    if (allowLlmAnalysis) {
      recordEvidenceLlmAnalysis(request, evidenceDraftStore);
    }
    enqueueSubmissionJob({
      submissionId: submission.id,
      ownerKey,
      content: jobText,
      localFilePaths: savedPaths,
      allowLlmAnalysis,
    });

    auditFromRequest(request, 'evidence.upload', '/api/evidence-upload', {
      submissionId: submission.id,
      fileCount: savedPaths.length,
      allowLlmAnalysis,
    });

    return reply.code(202).send({
      submission,
      draft: { content: savedDraft.content, updatedAt: savedDraft.updatedAt },
      queued: true,
    });
  });

  app.get('/api/evidence-submissions', authHook, async (request, reply) => {
    const ownerKey = evidenceOwnerKey(request);
    const limit = Math.min(Number(request.query?.limit ?? 10), 50);
    const submissions = evidenceDraftStore.getRecentSubmissions({ ownerKey, limit });
    return reply.send({ submissions });
  });

  app.get('/api/evidence-submissions/:id', authHook, async (request, reply) => {
    const submissionId = Number.parseInt(String(request.params?.id ?? ''), 10);
    if (!Number.isFinite(submissionId) || submissionId <= 0) {
      return reply.code(400).send({ error: 'invalid submission id' });
    }
    const ownerKey = evidenceOwnerKey(request);
    const submission = evidenceDraftStore.getSubmissionById({ submissionId, ownerKey });
    if (!submission) {
      return reply.code(404).send({ error: 'submission not found' });
    }
    return reply.send({ submission });
  });

  app.get('/api/evidence-submissions/latest', authHook, async (request, reply) => {
    const ownerKey = evidenceOwnerKey(request);
    const submission = evidenceDraftStore.getLatestSubmission({ ownerKey });
    if (!submission) {
      return reply.send({ found: false });
    }
    return reply.send({ found: true, submission });
  });
}
