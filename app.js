import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getTodayInTimezone, validateDate } from './utils/dateUtils.js';
import { getCachedReport, runAnalysis } from './api/analysisService.js';
import { streamChat } from './business_modules/chat/app/chatService.js';
import { VideoGrabService } from './business_modules/video/app/videoGrabService.js';
import { createYtDlpYoutubeAdapter } from './business_modules/video/infrastructure/adapters/ytDlpYoutubeAdapter.js';
import { createLocalVideoFileAdapter } from './business_modules/video/infrastructure/adapters/localVideoFileAdapter.js';
import { initFirebaseAdminForAuth } from './auth/firebaseAdmin.js';
import { requireAuthPreHandler } from './auth/requireAuthPreHandler.js';
import { createEvidenceDraftStore } from './cross-cut-modules/persistence/evidenceDraftStore.js';
import { createEvidenceStore } from './cross-cut-modules/persistence/evidenceStore.js';
import { classifyEvidenceInput } from './cross-cut-modules/evidence/evidenceInputClassifier.js';
import { AudioEvidenceIngestService } from './business_modules/audio/app/audioEvidenceIngestService.js';
import { OpenaiTranscriptionAdapter } from './business_modules/audio/infrastructure/adapters/openaiTranscriptionAdapter.js';
import { createHttpAudioDownloadAdapter } from './business_modules/audio/infrastructure/adapters/httpAudioDownloadAdapter.js';
import { runResilienceAssessment } from './business_modules/resilience/app/resilienceAnalysisService.js';
import { contentBatchFromMdArticles } from './business_modules/resilience/app/contentBatchFromMdArticles.js';
import { createAnthropicResilienceLlmAdapter } from './business_modules/resilience/infrastructure/adapters/anthropicResilienceLlmAdapter.js';
import { getEducationDashboard } from './business_modules/education/app/educationSessionsService.js';
import { getMunicipalityDashboard } from './business_modules/pbo_report_muni/app/pboMunicipalityService.js';
import { getNaftaliDashboard } from './business_modules/naftali/app/naftaliService.js';
import { getTranslatedReport } from './business_modules/translation/app/translationService.js';
import { createWhatsAppMessageStore } from './business_modules/whatsapp/infrastructure/whatsappMessageStore.js';
import { createWhatsAppSignalStore } from './business_modules/whatsapp/infrastructure/whatsappSignalStore.js';
import { createMetaCloudApiAdapter } from './business_modules/whatsapp/infrastructure/adapters/metaCloudApiAdapter.js';
import { createWhatsAppIngestService } from './business_modules/whatsapp/app/whatsappIngestService.js';
import { createWhatsAppResilienceAnalyzer } from './business_modules/whatsapp/app/whatsappResilienceAnalyzer.js';
import { whatsappWebhookPlugin } from './business_modules/whatsapp/input/webhook-routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Max characters stored for evidence draft (SQLite TEXT + API body). */
const MAX_EVIDENCE_DRAFT_CHARS = 500_000;

const sqlitePath = process.env.SQLITE_PATH?.trim()
  ? resolve(process.env.SQLITE_PATH.trim())
  : resolve(__dirname, 'data', 'app.sqlite');

const evidenceDraftStore = createEvidenceDraftStore(sqlitePath);
const evidenceStore = createEvidenceStore(sqlitePath);
let audioEvidenceIngestService = null;

function evidenceOwnerKey(request) {
  return request.user?.uid ?? 'anonymous';
}

const URL_REGEX = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
const AUDIO_URL_HINT_REGEX = /\.(mp3|wav|m4a|aac|ogg|flac|opus|webm|mp4)(?:$|[?#])/i;
const VIDEO_URL_HINT_REGEX = /\.(mp4|mov|mkv|webm|avi|m4v)(?:$|[?#])/i;

function extractUrls(text) {
  if (typeof text !== 'string' || !text) return [];
  return Array.from(text.matchAll(URL_REGEX), (m) => m[0].replace(/[),.;!?]+$/g, ''));
}

function isLikelyAudioDownloadUrl(url) {
  if (!AUDIO_URL_HINT_REGEX.test(url)) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isLikelyVideoDownloadUrl(url) {
  if (!VIDEO_URL_HINT_REGEX.test(url)) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isYoutubeUrl(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.includes('youtube.com') || h === 'youtu.be';
  } catch {
    return false;
  }
}

function normalizeWhitespace(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlToPlainText(html) {
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const noTags = noScript.replace(/<[^>]+>/g, ' ');
  return normalizeWhitespace(noTags);
}

async function webPageToEvidenceItem(url, date) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Web page fetch failed (${response.status})`);
  const html = await response.text();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = normalizeWhitespace(titleMatch?.[1] ?? '');
  const body = htmlToPlainText(html).slice(0, 3000);
  if (!body) throw new Error('Web page had no parseable text');
  return {
    date,
    source_type: 'news',
    source_label: 'web-url',
    source_url: url,
    title: title || `Web evidence from ${url}`,
    body,
    published_at: date,
  };
}

function getAudioEvidenceIngestService() {
  if (!audioEvidenceIngestService) {
    audioEvidenceIngestService = new AudioEvidenceIngestService({
      audioDownloadPort: createHttpAudioDownloadAdapter(),
      transcriptionPort: new OpenaiTranscriptionAdapter(),
    });
  }
  return audioEvidenceIngestService;
}

/**
 * @param {string} url
 * @returns {'audio_download_url'|'video_download_url'|'youtube_url'|'web_article_url'}
 */
function classifyUrlKind(url) {
  if (isLikelyAudioDownloadUrl(url)) return 'audio_download_url';
  if (isYoutubeUrl(url)) return 'youtube_url';
  if (isLikelyVideoDownloadUrl(url)) return 'video_download_url';
  return 'web_article_url';
}

function toAnalysisArticle(item, idx, sourceFile) {
  return {
    title: item.title ?? `Submission evidence ${idx + 1}`,
    body: item.body ?? '',
    url: item.source_url ?? '',
    publishedAt: item.published_at ?? '',
    source: item.source_label ?? 'submission',
    sourceFile,
  };
}

function buildExtractedContentReview(items, autoIngest) {
  const participantSet = new Set();
  const scenePoints = [];
  const topicFragments = [];

  for (const item of items) {
    const body = String(item.body ?? '');
    const lines = body.split('\n');
    for (const line of lines) {
      const speakerMatch = line.match(/^\s*([A-Za-z_][A-Za-z0-9_ -]{1,40}):/);
      if (speakerMatch) {
        const raw = speakerMatch[1].trim();
        if (raw.length > 0) participantSet.add(raw);
      }
    }
    const compact = body.replace(/\s+/g, ' ').trim();
    if (compact) {
      topicFragments.push(compact);
      if (scenePoints.length < 6) {
        scenePoints.push(compact.length > 220 ? `${compact.slice(0, 220)}...` : compact);
      }
    }
  }

  const topicSummaryRaw = topicFragments.slice(0, 2).join(' ');
  const topicSummary =
    topicSummaryRaw.length > 360 ? `${topicSummaryRaw.slice(0, 360)}...` : topicSummaryRaw;

  const sourceTypes = [...new Set(items.map((i) => i.source_type).filter(Boolean))];
  const sources = [...new Set(items.map((i) => i.source_label).filter(Boolean))].slice(0, 6);
  const snippets = items
    .slice(0, 10)
    .map((i) => {
      const text = String(i.body ?? '').replace(/\s+/g, ' ').trim();
      return {
        title: i.title ?? '(untitled)',
        sourceType: i.source_type ?? 'unknown',
        sourceUrl: i.source_url ?? '',
        snippet: text.length > 260 ? `${text.slice(0, 260)}...` : text,
      };
    });

  // Build a scene-structured video timeline for YouTube submissions.
  // Items are now LLM-contextualized scenes with headlines, narratives, key quotes,
  // and per-scene timestamped source_url (built by contextualizeTranscript).
  const isYoutubeSubmission = items.some((i) => i.source_label === 'youtube');
  let videoTimeline = null;
  if (isYoutubeSubmission) {
    videoTimeline = items.slice(0, 14).map((i) => {
      // Title format: "youtube — Submitted audio (...) — scene N: Headline text"
      const headline = String(i.title ?? '').replace(/^.*?—\s*scene\s+\d+:\s*/i, '').trim() || null;
      return {
        headline,
        url: i.source_url || null,
        quality: i.quality ?? null,
        text: String(i.body ?? '').trim(),
      };
    });
  }

  return {
    extractedItems: items.length,
    sourceTypes,
    sources,
    ingest: autoIngest,
    snippets,
    videoTimeline,
    plotReview: {
      topic: topicSummary || 'Topic could not be confidently inferred from extracted text.',
      participants: [...participantSet].slice(0, 12),
      whatWasShown: scenePoints,
    },
  };
}

/**
 * @param {{ apiKey: string, fetchArticlesForDay: (opts: { date: string }) => Promise<Array>, timezone?: string, authRequired?: boolean }} options
 */
export async function createApp(options) {
  const apiKey = options?.apiKey?.trim?.() ?? '';
  if (!apiKey) {
    throw new Error('API key is required (set NEWSAPI_API_KEY in .env)');
  }

  const timezone = options.timezone || 'Asia/Jerusalem';
  const fetchArticlesForDay = options.fetchArticlesForDay;

  const authRequired =
    options.authRequired ??
    (process.env.AUTH_REQUIRED === 'true' && !!process.env.FIREBASE_PROJECT_ID?.trim());

  if (authRequired) {
    initFirebaseAdminForAuth(process.env.FIREBASE_PROJECT_ID.trim());
  }

  const authHook = authRequired ? { preHandler: requireAuthPreHandler } : {};

  const app = Fastify({ logger: false, bodyLimit: 10 * 1024 * 1024 /* 10 MB */ });

  const videoDownloadDir = process.env.VIDEO_DOWNLOAD_DIR?.trim()
    ? resolve(process.env.VIDEO_DOWNLOAD_DIR)
    : resolve(__dirname, 'downloads', 'video');

  const videoGrabService = new VideoGrabService({
    remoteFetchPort: createYtDlpYoutubeAdapter(),
    localFilePort: createLocalVideoFileAdapter(),
  });

  const submissionQueue = [];
  let processingSubmissionQueue = false;

  async function processSubmissionJob({ submissionId, ownerKey, content }) {
    let autoIngest = { attempted: false, insertedItems: 0, errors: [], kinds: [] };
    const analysisEvidenceItems = [];
    const urls = extractUrls(content);

    if (urls.length > 0) {
      autoIngest.attempted = true;
      const reportDate = getTodayInTimezone(process.env.TZ_ARTICLES || 'Asia/Jerusalem');
      const ingestService = getAudioEvidenceIngestService();
      for (const url of urls) {
        const kind = classifyUrlKind(url);
        autoIngest.kinds.push({ url, kind });
        try {
          if (kind === 'audio_download_url') {
            const items = await ingestService.ingestAudioUrlToEvidenceItems({ url, date: reportDate });
            if (items.length > 0) {
              autoIngest.insertedItems += evidenceStore.insertItems(items);
              analysisEvidenceItems.push(...items);
            }
          } else if (kind === 'video_download_url' || kind === 'youtube_url') {
            await mkdir(videoDownloadDir, { recursive: true });
            const dl = await videoGrabService.downloadFromUrl(url, videoDownloadDir);
            if (!dl?.ok || !dl?.outputPath) {
              throw new Error(dl?.error || 'video download failed');
            }
            const items = await ingestService.ingestAudioFileToEvidenceItems({
              filePath: dl.outputPath,
              date: reportDate,
              sourceUrl: url,
              sourceLabel: kind === 'youtube_url' ? 'youtube' : 'video-download-url',
            });
            if (items.length > 0) {
              autoIngest.insertedItems += evidenceStore.insertItems(items);
              analysisEvidenceItems.push(...items);
            }
          } else {
            const item = await webPageToEvidenceItem(url, reportDate);
            autoIngest.insertedItems += evidenceStore.insertItems([item]);
            analysisEvidenceItems.push(item);
          }
        } catch (err) {
          autoIngest.errors.push(`${url}: ${err?.message ?? 'ingest failed'}`);
        }
      }
    }

    evidenceDraftStore.setSubmissionIngestStatus({
      submissionId,
      ownerKey,
      status: urls.length > 0 && autoIngest.errors.length === urls.length ? 'failed' : 'processed',
      details:
        autoIngest.errors.length > 0
          ? autoIngest.errors.join(' | ').slice(0, 4000)
          : `inserted=${autoIngest.insertedItems}`,
    });

    // Plain text submission (no URLs) — store as evidence for future analysis, skip LLM pipeline
    if (analysisEvidenceItems.length === 0) {
      const reportDate = getTodayInTimezone(process.env.TZ_ARTICLES || 'Asia/Jerusalem');
      const manualItem = {
        date: reportDate,
        source_type: 'manual',
        source_label: 'manual-input',
        source_url: '',
        title: 'Manual evidence submission',
        body: content,
        published_at: reportDate,
      };
      evidenceStore.insertItems([manualItem]);
      evidenceDraftStore.setSubmissionAnalysisResult({
        submissionId,
        ownerKey,
        status: 'processed',
        details: 'stored as evidence; no LLM analysis for single text items',
        analysisJson: null,
      });
      return;
    }

    evidenceDraftStore.setSubmissionExtractedContent({
      submissionId,
      ownerKey,
      extractedContentJson: buildExtractedContentReview(analysisEvidenceItems, autoIngest),
    });

    try {
      if (!process.env.ANTHROPIC_API_KEY?.trim()) {
        throw new Error('ANTHROPIC_API_KEY not set');
      }
      const reportDate = getTodayInTimezone(process.env.TZ_ARTICLES || 'Asia/Jerusalem');
      const sourceTypes = [...new Set(analysisEvidenceItems.map((i) => i.source_type))];
      const contentKind = sourceTypes.length === 1 && sourceTypes[0] === 'audio' ? 'audio' : 'news';
      const analysisArticles = analysisEvidenceItems.map((item, idx) =>
        toAnalysisArticle(item, idx, `submission:${submissionId}`),
      );
      const batch = contentBatchFromMdArticles(analysisArticles, {
        reportDate,
        contentKind,
        sourceRunId: `submission:${submissionId}`,
      });
      const llmPort = createAnthropicResilienceLlmAdapter();
      const result = await runResilienceAssessment(batch, {
        llmPort,
        dedupeTitles: true,
        persist: false,
      });
      evidenceDraftStore.setSubmissionAnalysisResult({
        submissionId,
        ownerKey,
        status: 'processed',
        details: `signals=${result.signals.length}; items=${analysisArticles.length}`,
        analysisJson: result.assessment,
      });
    } catch (err) {
      evidenceDraftStore.setSubmissionAnalysisResult({
        submissionId,
        ownerKey,
        status: 'failed',
        details: (err?.message ?? 'submission analysis failed').slice(0, 4000),
        analysisJson: null,
      });
    }
  }

  const SUBMISSION_JOB_TIMEOUT_MS = 20 * 60 * 1000; // 20 min hard cap per job

  async function drainSubmissionQueue() {
    if (processingSubmissionQueue) return;
    processingSubmissionQueue = true;
    try {
      while (submissionQueue.length > 0) {
        const job = submissionQueue.shift();
        try {
          await Promise.race([
            processSubmissionJob(job),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('submission job timed out after 20 minutes')), SUBMISSION_JOB_TIMEOUT_MS),
            ),
          ]);
        } catch (err) {
          evidenceDraftStore.setSubmissionIngestStatus({
            submissionId: job.submissionId,
            ownerKey: job.ownerKey,
            status: 'failed',
            details: (err?.message ?? 'submission processing failed').slice(0, 4000),
          });
          evidenceDraftStore.setSubmissionAnalysisResult({
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

  // ─── Public: client discovers whether JWT is required (no auth) ────────────
  app.get('/api/auth/config', async (_req, reply) => {
    return reply.send({ authRequired });
  });

  // ─── Protected API routes (when AUTH_REQUIRED=true) ───────────────────────
  app.get('/api/report/today', authHook, async (_req, reply) => {
    const data = getCachedReport(evidenceStore);
    return reply.send(data ? { found: true, ...data } : { found: false });
    // Note: data.reportDate is included via spread — client uses it for staleness banner
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
    if (content.length > MAX_EVIDENCE_DRAFT_CHARS) {
      return reply.code(400).send({
        error: `content too long (max ${MAX_EVIDENCE_DRAFT_CHARS} characters)`,
      });
    }
    const row = evidenceDraftStore.save(evidenceOwnerKey(request), content);
    return reply.send({ content: row.content, updatedAt: row.updatedAt });
  });

  app.post('/api/evidence-submit', authHook, async (request, reply) => {
    const body = request.body ?? {};
    const content = body.content;
    if (typeof content !== 'string') {
      return reply.code(400).send({ error: 'content must be a string' });
    }
    if (content.length > MAX_EVIDENCE_DRAFT_CHARS) {
      return reply.code(400).send({
        error: `content too long (max ${MAX_EVIDENCE_DRAFT_CHARS} characters)`,
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
    enqueueSubmissionJob({ submissionId: submission.id, ownerKey, content });

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

  app.post('/api/analyze', authHook, async (_req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const send = (data) => reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      const { assessment, costUsd, date } = await runAnalysis({ onProgress: send, store: evidenceStore });
      send({ type: 'done', assessment, costUsd, date });
    } catch (err) {
      send({ type: 'error', message: err.message });
    }
    reply.raw.end();
  });

  app.post('/api/video/download-url', authHook, async (request, reply) => {
    const { url } = request.body ?? {};
    if (url == null || typeof url !== 'string' || !url.trim()) {
      return reply.code(400).send({ error: 'url is required' });
    }

    await mkdir(videoDownloadDir, { recursive: true });

    const result = await videoGrabService.downloadFromUrl(url, videoDownloadDir);
    if (!result.ok) {
      return reply.code(502).send({
        ok: false,
        error: result.error,
        stderr: typeof result.stderr === 'string' ? result.stderr.slice(0, 4000) : undefined,
      });
    }

    return reply.send({ success: true, outputPath: result.outputPath });
  });

  app.post('/api/video/local-file', authHook, async (request, reply) => {
    const { relativePath } = request.body ?? {};
    if (relativePath == null || typeof relativePath !== 'string' || !relativePath.trim()) {
      return reply.code(400).send({ error: 'relativePath is required' });
    }

    const result = await videoGrabService.resolveLocalVideo(relativePath.trim());
    if (!result.ok) {
      return reply.code(400).send(result);
    }

    return reply.send({ success: true, outputPath: result.outputPath });
  });

  app.get('/api/education-sessions', authHook, async (request, reply) => {
    const forceRefresh = request.query?.refresh === '1';
    try {
      const data = await getEducationDashboard({ forceRefresh });
      return reply.send(data);
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load education data' });
    }
  });

  app.get('/api/municipalities', authHook, async (request, reply) => {
    try {
      const data = getMunicipalityDashboard();
      return reply.send(data);
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load municipality data' });
    }
  });

  app.get('/api/naftali', authHook, async (request, reply) => {
    const forceRefresh = request.query?.refresh === '1';
    try {
      const data = await getNaftaliDashboard({ forceRefresh });
      return reply.send(data);
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load Naftali data' });
    }
  });

  app.post('/api/translate', authHook, async (request, reply) => {
    const { report, lang } = request.body ?? {};
    if (!report || !lang || lang === 'en') return reply.send({ report: report ?? null });
    if (process.env.TRANSLATION_ENABLED !== 'true') return reply.send({ report });
    try {
      // Attach score_by_source from the cached report so signal evidence gets translated.
      // The client sends only the assessment object (too large to include signals in POST body).
      if (!report.score_by_source) {
        const cached = getCachedReport(evidenceStore);
        if (cached?.score_by_source) report.score_by_source = cached.score_by_source;
      }
      const translated = await getTranslatedReport(report, lang);
      return reply.send({ report: translated });
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Translation failed' });
    }
  });

  app.post('/api/chat', authHook, async (request, reply) => {
    const { message, history = [] } = request.body ?? {};
    if (!message) return reply.code(400).send({ error: 'message required' });

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    await streamChat(message, history, reply.raw, getCachedReport);
    reply.raw.end();
  });

  app.get('/articles', authHook, async (request, reply) => {
    const dateParam = request.query?.date;
    const date =
      dateParam != null && dateParam !== ''
        ? String(dateParam).trim()
        : getTodayInTimezone(timezone);

    const validation = validateDate(date, timezone);
    if (!validation.valid) {
      return reply.code(400).send({ error: validation.error });
    }

    try {
      const articles = await fetchArticlesForDay({ date });
      return reply.code(200).send(Array.isArray(articles) ? articles : []);
    } catch {
      return reply.code(502).send({ error: 'Upstream unavailable' });
    }
  });

  // ─── WhatsApp webhook (no auth — Meta verifies via verify token) ─────────
  if (process.env.WHATSAPP_VERIFY_TOKEN) {
    const whatsappMessageStore = createWhatsAppMessageStore(sqlitePath);
    const whatsappSignalStore = createWhatsAppSignalStore(sqlitePath);
    const whatsappApiAdapter = createMetaCloudApiAdapter({
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    });
    const whatsappResilienceAnalyzer = process.env.ANTHROPIC_API_KEY?.trim()
      ? createWhatsAppResilienceAnalyzer({ anthropicApiKey: process.env.ANTHROPIC_API_KEY.trim() })
      : null;
    const whatsappIngestService = createWhatsAppIngestService({
      messageStore: whatsappMessageStore,
      apiAdapter: whatsappApiAdapter,
      evidenceStore,
      signalStore: whatsappSignalStore,
      resilienceAnalyzer: whatsappResilienceAnalyzer,
      allowedGroupIds: (process.env.WHATSAPP_ALLOWED_GROUP_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean),
    });
    await app.register(whatsappWebhookPlugin, {
      ingestService: whatsappIngestService,
      apiAdapter: whatsappApiAdapter,
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    });
  }

  // ─── Static SPA (after API routes) ───────────────────────────────────────
  // __dirname is the repo root (where app.js lives); serve Vite build at client/dist
  const clientDist = resolve(__dirname, 'client', 'dist');
  await app.register(fastifyStatic, { root: clientDist, prefix: '/' });

  return app;
}
