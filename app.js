import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { createWriteStream } from 'fs';
import { mkdir, readFile } from 'fs/promises';
import { resolve, dirname, join, basename, extname, sep } from 'path';
import { pipeline } from 'stream/promises';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import YAML from 'yaml';
import { getTodayInTimezone, validateDate } from './utils/dateUtils.js';
import { getCachedReport, runAnalysis } from './api/analysisService.js';
import { streamChat } from './business_modules/chat/app/chatService.js';
import { generateChatTitle } from './business_modules/chat/infrastructure/claudeChat.js';
import { VideoGrabService } from './business_modules/video/app/videoGrabService.js';
import { YoutubeTranscriptService } from './business_modules/video/app/youtubeTranscriptService.js';
import { YoutubeEvidenceIngestService } from './business_modules/video/app/youtubeEvidenceIngestService.js';
import { createYtDlpYoutubeAdapter } from './business_modules/video/infrastructure/adapters/ytDlpYoutubeAdapter.js';
import { createYoutubeDataApiCaptionsAdapter } from './business_modules/video/infrastructure/adapters/youtubeDataApiCaptionsAdapter.js';
import { createLocalVideoFileAdapter } from './business_modules/video/infrastructure/adapters/localVideoFileAdapter.js';
import { initFirebaseAdminForAuth } from './auth/firebaseAdmin.js';
import { requireAuthPreHandler } from './auth/requireAuthPreHandler.js';
import { tryAuthPreHandler } from './auth/tryAuthPreHandler.js';
import { createEvidenceDraftStore } from './cross-cut-modules/persistence/evidenceDraftStore.js';
import { createEvidenceStore } from './cross-cut-modules/persistence/evidenceStore.js';
import { createChatStore } from './business_modules/chat/infrastructure/chatStore.js';
import { classifyEvidenceInput } from './cross-cut-modules/evidence/evidenceInputClassifier.js';
import { AudioEvidenceIngestService } from './business_modules/audio/app/audioEvidenceIngestService.js';
import { contextualizeTranscript } from './business_modules/audio/app/audioTranscriptContextualizer.js';
import { OpenaiTranscriptionAdapter } from './business_modules/audio/infrastructure/adapters/openaiTranscriptionAdapter.js';
import { createHttpAudioDownloadAdapter } from './business_modules/audio/infrastructure/adapters/httpAudioDownloadAdapter.js';
import { runResilienceAssessment } from './business_modules/resilience/app/resilienceAnalysisService.js';
import { contentBatchFromMdArticles } from './business_modules/resilience/app/contentBatchFromMdArticles.js';
import { createAnthropicResilienceLlmAdapter } from './business_modules/resilience/infrastructure/adapters/anthropicResilienceLlmAdapter.js';
import { createOverridesStore } from './business_modules/resilience/infrastructure/overridesStore.js';
import { createOverridesService } from './business_modules/resilience/app/overridesService.js';
import { registerOverridesRoutes } from './business_modules/resilience/input/overridesRoutes.js';
import { createDriftService } from './business_modules/resilience/app/driftService.js';
import { registerDriftRoutes } from './business_modules/resilience/input/driftRoutes.js';
import { getEducationDashboard } from './business_modules/education/app/educationSessionsService.js';
import { getMunicipalityDashboard } from './business_modules/pbo_report_muni/app/pboMunicipalityService.js';
import {
  createPboRegionalDailyService,
  createPboReportRegionalFsAdapter,
} from './business_modules/pbo_report_regional/index.js';
import { getNaftaliDashboard } from './business_modules/naftali/app/naftaliService.js';
import { createVisitsFsAdapter, createVisitsService, visitsRoutes } from './business_modules/visits/index.js';
import {
  chatbotManualReportsRoutes,
  createChatbotManualReportsFsAdapter,
  createChatbotManualReportsService,
} from './business_modules/chatbot/index.js';
import { getTranslatedReport } from './business_modules/translation/app/translationService.js';
import { createWhatsAppMessageStore } from './business_modules/whatsapp/infrastructure/whatsappMessageStore.js';
import { createWhatsAppSignalStore } from './business_modules/whatsapp/infrastructure/whatsappSignalStore.js';
import { createWhatsAppConversationStore } from './business_modules/whatsapp/infrastructure/whatsappConversationStore.js';
import { createWhatsAppReportDraftStore } from './business_modules/whatsapp/infrastructure/whatsappReportDraftStore.js';
import { createMetaCloudApiAdapter } from './business_modules/whatsapp/infrastructure/adapters/metaCloudApiAdapter.js';
import { createWhatsAppIngestService } from './business_modules/whatsapp/app/whatsappIngestService.js';
import { createWhatsAppResilienceAnalyzer } from './business_modules/whatsapp/app/whatsappResilienceAnalyzer.js';
import { createDraftGenerator } from './business_modules/whatsapp/app/draftGenerator.js';
import { whatsappWebhookPlugin } from './business_modules/whatsapp/input/webhook-routes.js';
import { createReportBuildService } from './business_modules/report_build/app/reportBuildService.js';
import { createAnthropicReportBuildAnalyzerAdapter } from './business_modules/report_build/infrastructure/adapters/anthropicReportBuildAnalyzerAdapter.js';
import { createAnthropicReportBuildSuggestAdapter } from './business_modules/report_build/infrastructure/adapters/anthropicReportBuildSuggestAdapter.js';
import { createAnthropicReportBuildDraftGeneratorAdapter } from './business_modules/report_build/infrastructure/adapters/anthropicReportBuildDraftGeneratorAdapter.js';
import { createReportBuildConversationStore } from './business_modules/report_build/infrastructure/reportBuildConversationStore.js';
import { createReportBuildDraftStore } from './business_modules/report_build/infrastructure/reportBuildDraftStore.js';
import { reportBuildRoutes } from './business_modules/report_build/input/reportBuildRoutes.js';
import { createMailingPreferencesStore } from './business_modules/mailing/infrastructure/mailingPreferencesStore.js';
import { createMailingResendAdapter } from './business_modules/mailing/infrastructure/adapters/mailingResendAdapter.js';
import { createMailingService } from './business_modules/mailing/app/mailingService.js';
import { mailingRoutes } from './business_modules/mailing/input/mailingRoutes.js';
import { buildProductDocsIndex, loadProductDocPage } from './utils/productDocs.js';
import { createVectorIndexStore } from './cross-cut-modules/vector_index/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Max characters stored for evidence draft (SQLite TEXT + API body). */
const MAX_EVIDENCE_DRAFT_CHARS = 500_000;

const sqlitePath = process.env.SQLITE_PATH?.trim()
  ? resolve(process.env.SQLITE_PATH.trim())
  : resolve(__dirname, 'data', 'app.sqlite');

const evidenceDraftStore = createEvidenceDraftStore(sqlitePath);
const evidenceStore = createEvidenceStore(sqlitePath);
const chatStore = createChatStore(sqlitePath);
const vectorIndexStore = createVectorIndexStore(sqlitePath);
const mailingPrefsStore = createMailingPreferencesStore(sqlitePath);
const visitsService = createVisitsService({
  visitsRepository: createVisitsFsAdapter({
    rootDir: __dirname,
    reportsDir: resolve(__dirname, 'business_modules', 'visits', 'data'),
    signalsDir: resolve(__dirname, 'business_modules', 'visits', 'data', 'signals'),
  }),
});

const chatbotManualReportsService = createChatbotManualReportsService({
  repository: createChatbotManualReportsFsAdapter({ rootDir: __dirname }),
});

const pboRegionalDailyService = createPboRegionalDailyService({
  repository: createPboReportRegionalFsAdapter({
    dataDir: resolve(__dirname, 'business_modules', 'pbo_report_regional', 'data'),
  }),
});

function isMailingConfigured() {
  if (process.env.MAILING_ENABLED === 'false') return false;
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();
  return Boolean(key && from);
}

const mailingService = isMailingConfigured()
  ? createMailingService({
    deliveryPort: createMailingResendAdapter({ apiKey: process.env.RESEND_API_KEY.trim() }),
    mailFrom: process.env.MAIL_FROM.trim(),
    getCachedReport: () => getCachedReport(evidenceStore),
    translateReport: getTranslatedReport,
  })
  : null;
let audioEvidenceIngestService = null;

function evidenceOwnerKey(request) {
  return request.user?.uid ?? 'anonymous';
}

function chatOwnerUid(request) {
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

const LOCAL_VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv', '.avi', '.m4v', '.webm']);
const LOCAL_AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.flac', '.opus']);

/**
 * @param {string} filePath
 * @returns {'audio'|'video'|'unsupported'}
 */
function classifyLocalEvidenceFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (LOCAL_VIDEO_EXT.has(ext)) return 'video';
  if (LOCAL_AUDIO_EXT.has(ext)) return 'audio';
  return 'unsupported';
}

function isPathUnderUploadRoot(filePath, rootDir) {
  const file = resolve(filePath);
  const root = resolve(rootDir);
  return file === root || file.startsWith(root + sep);
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
  const tryAuthHook = authRequired ? { preHandler: tryAuthPreHandler } : {};

  const app = Fastify({ logger: false, bodyLimit: 10 * 1024 * 1024 /* 10 MB */ });

  await app.register(multipart, {
    limits: {
      fileSize: Number(process.env.EVIDENCE_MAX_FILE_BYTES) || 100 * 1024 * 1024,
      files: 25,
    },
  });

  // ─── OpenAPI + Swagger UI (source of truth: openapi/openapi.yaml) ─────────
  const openapiPath = resolve(__dirname, 'openapi', 'openapi.yaml');
  let openapiDocument = null;
  try {
    openapiDocument = YAML.parse(await readFile(openapiPath, 'utf8'));
  } catch {
    openapiDocument = null;
  }

  if (openapiDocument) {
    await app.register(fastifySwagger, { openapi: openapiDocument });
    await app.register(fastifySwaggerUi, {
      routePrefix: '/api/swagger',
      uiConfig: { docExpansion: 'list' },
    });
  }

  const videoDownloadDir = process.env.VIDEO_DOWNLOAD_DIR?.trim()
    ? resolve(process.env.VIDEO_DOWNLOAD_DIR)
    : resolve(__dirname, 'downloads', 'video');

  const evidenceUserUploadsRoot = resolve(__dirname, 'data', 'evidence-uploads');

  const ytDlpAdapter = createYtDlpYoutubeAdapter();
  const videoGrabService = new VideoGrabService({
    remoteFetchPort: ytDlpAdapter,
    localFilePort: createLocalVideoFileAdapter(),
  });
  const youtubeEvidenceIngestService = new YoutubeEvidenceIngestService({
    transcriptService: new YoutubeTranscriptService({
      remoteFetchPort: ytDlpAdapter,
      dataApiCaptions: createYoutubeDataApiCaptionsAdapter(),
    }),
    videoGrabService,
    audioEvidenceIngestService: {
      ingestAudioFileToEvidenceItems: (...args) => getAudioEvidenceIngestService().ingestAudioFileToEvidenceItems(...args),
    },
    contextualizeTranscript,
  });

  const submissionQueue = [];
  let processingSubmissionQueue = false;

  // ─── Report-build (shared interactive report writing) ──────────────────
  const reportBuildService = process.env.ANTHROPIC_API_KEY?.trim()
    ? createReportBuildService({
        analyzerPort: createAnthropicReportBuildAnalyzerAdapter({
          anthropicApiKey: process.env.ANTHROPIC_API_KEY.trim(),
        }),
        suggestAnalyzerPort: createAnthropicReportBuildSuggestAdapter({
          anthropicApiKey: process.env.ANTHROPIC_API_KEY.trim(),
        }),
        draftGeneratorPort: createAnthropicReportBuildDraftGeneratorAdapter({
          anthropicApiKey: process.env.ANTHROPIC_API_KEY.trim(),
        }),
        conversationStore: createReportBuildConversationStore(sqlitePath),
        draftStore: createReportBuildDraftStore(sqlitePath),
      })
    : null;

  async function processSubmissionJob({ submissionId, ownerKey, content, localFilePaths = [] }) {
    let autoIngest = { attempted: false, insertedItems: 0, errors: [], kinds: [] };
    const analysisEvidenceItems = [];
    const urls = extractUrls(content);
    const safeLocalPaths = Array.isArray(localFilePaths) ? localFilePaths : [];
    const reportDate = getTodayInTimezone(process.env.TZ_ARTICLES || 'Asia/Jerusalem');
    const ingestService = getAudioEvidenceIngestService();

    if (urls.length > 0) {
      autoIngest.attempted = true;
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
          } else if (kind === 'youtube_url') {
            await mkdir(videoDownloadDir, { recursive: true });
            const result = await youtubeEvidenceIngestService.ingestYoutubeUrlToEvidenceItems({
              url,
              date: reportDate,
              outputDir: videoDownloadDir,
              onUsage: undefined,
            });
            const items = result.items;
            if (items.length > 0) {
              autoIngest.insertedItems += evidenceStore.insertItems(items);
              analysisEvidenceItems.push(...items);
            }
          } else if (kind === 'video_download_url') {
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

    for (const filePath of safeLocalPaths) {
      if (!isPathUnderUploadRoot(filePath, evidenceUserUploadsRoot)) {
        autoIngest.errors.push(`${filePath}: invalid storage path`);
        continue;
      }
      const kind = classifyLocalEvidenceFile(filePath);
      if (kind === 'unsupported') {
        autoIngest.errors.push(
          `${basename(filePath)}: unsupported type (upload .mp3/.m4a/.wav… or .mp4/.webm/… video)`,
        );
        continue;
      }
      autoIngest.attempted = true;
      try {
        const label = kind === 'video' ? 'user-upload-video' : 'user-upload-audio';
        const items = await ingestService.ingestAudioFileToEvidenceItems({
          filePath,
          date: reportDate,
          sourceUrl: '',
          sourceLabel: label,
        });
        if (items.length > 0) {
          autoIngest.insertedItems += evidenceStore.insertItems(items);
          analysisEvidenceItems.push(...items);
        }
      } catch (err) {
        autoIngest.errors.push(`${basename(filePath)}: ${err?.message ?? 'ingest failed'}`);
      }
    }

    const sourceCount = urls.length + safeLocalPaths.length;
    const ingestFailed = sourceCount > 0 && autoIngest.insertedItems === 0;

    evidenceDraftStore.setSubmissionIngestStatus({
      submissionId,
      ownerKey,
      status: ingestFailed ? 'failed' : 'processed',
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

  // ─── Product docs content API (single source: product_docs/) ──────────────
  const productDocsRoot = resolve(__dirname, 'product_docs');

  app.get('/api/docs/index', tryAuthHook, async (request, reply) => {
    const index = await buildProductDocsIndex({ docsRootDir: productDocsRoot });
    const isAuthed = !authRequired || !!request.user;
    const pages = index.pages.map((p) => ({
      ...p,
      locked: p.gated && !isAuthed,
    }));
    return reply.send({ pages });
  });

  app.get('/api/docs/page/:slug', tryAuthHook, async (request, reply) => {
    const slug = request.params?.slug;
    const page = await loadProductDocPage({ docsRootDir: productDocsRoot, slug });
    if (!page.ok) return reply.code(page.code).send({ error: page.error });
    if (authRequired && page.gated && !request.user) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'docs_page_locked' });
    }
    return reply.send({ meta: page.meta ?? {}, markdown: page.markdown ?? '' });
  });

  // Serve the OpenAPI document as JSON for generators.
  app.get('/api/openapi.json', async (_req, reply) => {
    if (!openapiDocument) return reply.code(404).send({ error: 'OpenAPI document not configured' });
    return reply.send(openapiDocument);
  });

  // ─── Protected API routes (when AUTH_REQUIRED=true) ───────────────────────
  const overridesStore = createOverridesStore();
  const overridesService = createOverridesService({ store: overridesStore });

  app.get('/api/report/today', authHook, async (request, reply) => {
    const scope = request.query?.scope === 'north' ? 'north' : 'national';
    const data = getCachedReport(evidenceStore, { scope });
    if (!data) return reply.send({ found: false });
    let overrides_count = {};
    try {
      if (typeof data.reportDate === 'string') {
        overrides_count = overridesService.countByComponent({ date: data.reportDate, scope });
      }
    } catch {
      /* non-fatal: overrides are optional metadata */
    }
    return reply.send({ found: true, ...data, overrides_count });
  });

  await registerOverridesRoutes(app, {
    service: overridesService,
    authPreHandler: authHook?.preHandler,
  });

  const driftService = createDriftService({ overridesService });
  await registerDriftRoutes(app, {
    driftService,
    authPreHandler: authHook?.preHandler,
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
    enqueueSubmissionJob({ submissionId: submission.id, ownerKey, content, localFilePaths: [] });

    return reply.code(202).send({
      submission,
      draft: { content: savedDraft.content, updatedAt: savedDraft.updatedAt },
      queued: true,
    });
  });

  app.post('/api/evidence-upload', authHook, async (request, reply) => {
    if (!request.isMultipart()) {
      return reply.code(400).send({ error: 'use multipart/form-data with field "content" and optional file fields "files"' });
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
          const safe = basename(rawName).replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';
          const dest = join(batchDir, `${savedPaths.length}-${safe}`);
          await pipeline(part.file, createWriteStream(dest));
          savedPaths.push(dest);
        } else if (part.type === 'field' && part.fieldname === 'content') {
          textContent = String(part.value ?? '');
        }
      }
    } catch (err) {
      return reply.code(400).send({ error: (err && err.message) || 'upload failed' });
    }

    if (!textContent.trim() && savedPaths.length === 0) {
      return reply.code(400).send({ error: 'Add text/URLs and/or at least one file' });
    }

    const contentForStore =
      textContent.trim() ||
      (savedPaths.length ? `[File upload: ${savedPaths.length} file(s)]` : '');
    if (contentForStore.length > MAX_EVIDENCE_DRAFT_CHARS) {
      return reply.code(400).send({ error: `content too long (max ${MAX_EVIDENCE_DRAFT_CHARS} characters)` });
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
    enqueueSubmissionJob({
      submissionId: submission.id,
      ownerKey,
      content: jobText,
      localFilePaths: savedPaths,
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

  app.get('/api/pbo/regional-report-days/:regionId', authHook, async (request, reply) => {
    const { regionId } = request.params ?? {};
    try {
      const data = pboRegionalDailyService.getRegionalPboReportDays(String(regionId ?? ''));
      return reply.send(data);
    } catch (err) {
      if (err?.code === 'UNKNOWN_REGION') {
        return reply.code(400).send({ error: err.message, code: 'UNKNOWN_REGION' });
      }
      return reply.code(502).send({ error: err?.message ?? 'Failed to load regional PBO reports' });
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
        const scope = report.report_scope?.id === 'north' ? 'north' : 'national';
        const cached = getCachedReport(evidenceStore, { scope });
        if (cached?.score_by_source) report.score_by_source = cached.score_by_source;
      }
      const translated = await getTranslatedReport(report, lang);
      return reply.send({ report: translated });
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Translation failed' });
    }
  });

  // ─── Chat sessions (persisted) ─────────────────────────────────────────
  app.get('/api/chat/sessions', authHook, async (request, reply) => {
    const uid = chatOwnerUid(request);
    const dateParam = request.query?.date != null ? String(request.query.date).trim() : '';
    const reportDate = dateParam || getTodayInTimezone(timezone);
    return reply.send({ sessions: chatStore.listSessions({ ownerUid: uid, reportDate }) });
  });

  app.post('/api/chat/sessions', authHook, async (request, reply) => {
    const uid = chatOwnerUid(request);
    const { date, title } = request.body ?? {};
    const reportDate = String(date ?? '').trim() || getTodayInTimezone(timezone);
    const id = chatStore.createSession({ ownerUid: uid, reportDate, title });
    return reply.code(201).send({ id });
  });

  app.put('/api/chat/sessions/:id', authHook, async (request, reply) => {
    const uid = chatOwnerUid(request);
    const sessionId = String(request.params?.id ?? '').trim();
    const { title } = request.body ?? {};
    if (!sessionId) return reply.code(400).send({ error: 'session id required' });
    const ok = chatStore.renameSession({ ownerUid: uid, sessionId, title });
    return reply.send({ ok });
  });

  app.delete('/api/chat/sessions/:id', authHook, async (request, reply) => {
    const uid = chatOwnerUid(request);
    const sessionId = String(request.params?.id ?? '').trim();
    if (!sessionId) return reply.code(400).send({ error: 'session id required' });
    const ok = chatStore.deleteSession({ ownerUid: uid, sessionId });
    return reply.send({ ok });
  });

  app.get('/api/chat/sessions/:id/messages', authHook, async (request, reply) => {
    const uid = chatOwnerUid(request);
    const sessionId = String(request.params?.id ?? '').trim();
    const session = chatStore.getSession(sessionId);
    if (!session || session.owner_uid !== uid) return reply.code(404).send({ error: 'not found' });
    return reply.send({ messages: chatStore.listMessages({ sessionId }) });
  });

  app.delete('/api/chat/sessions/:id/messages/:messageId', authHook, async (request, reply) => {
    const uid = chatOwnerUid(request);
    const sessionId = String(request.params?.id ?? '').trim();
    const messageId = String(request.params?.messageId ?? '').trim();
    const session = chatStore.getSession(sessionId);
    if (!session || session.owner_uid !== uid) return reply.code(404).send({ error: 'not found' });
    const ok = chatStore.hideMessage({ sessionId, messageId });
    return reply.send({ ok });
  });

  app.post('/api/chat', authHook, async (request, reply) => {
    const { sessionId, message, action, scope } = request.body ?? {};

    const uid = chatOwnerUid(request);
    const sid = String(sessionId ?? '').trim();
    if (!sid) return reply.code(400).send({ error: 'sessionId required' });
    const session = chatStore.getSession(sid);
    if (!session || session.owner_uid !== uid) return reply.code(404).send({ error: 'session not found' });

    const existing = chatStore.listMessages({ sessionId: sid });
    const history = existing.map((m) => ({ role: m.role, content: m.content }));

    let systemHint = '';
    if (scope && typeof scope === 'object') {
      if (scope.type === 'component' && scope.id) {
        systemHint = `User focus: component=${scope.id}${scope.label ? ` (${scope.label})` : ''}. Prefer citing evidence for this component unless asked otherwise.`;
      } else if (scope.type === 'all') {
        systemHint = 'User focus: full report context.';
      }
    }

    const act = String(action ?? 'send');
    let userMessage = String(message ?? '').trim();
    const shouldPersistUser =
      act === 'send' || act === 'continue' || act === 'edit_resend';

    if (act === 'regenerate') {
      const lastUser = [...existing].reverse().find((m) => m.role === 'user');
      userMessage = String(lastUser?.content ?? '').trim();
    }

    if (!userMessage) return reply.code(400).send({ error: 'message required' });

    if (shouldPersistUser) {
      chatStore.addMessage({ sessionId: sid, role: 'user', content: userMessage, meta: { action: act } });
      chatStore.touchSession({ ownerUid: uid, sessionId: sid });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    let assistantText = '';
    await streamChat(userMessage, history, reply.raw, getCachedReport, {
      evidenceStore,
      vectorIndexStore,
      systemHint,
      onSend: (event) => {
        if (event?.type === 'text' && typeof event.text === 'string') assistantText += event.text;
      },
    });
    if (assistantText) {
      chatStore.addMessage({ sessionId: sid, role: 'assistant', content: assistantText, meta: null });
      chatStore.touchSession({ ownerUid: uid, sessionId: sid });
    }

    // Auto-title: if session title is empty, generate after first exchange.
    try {
      const current = chatStore.getSession(sid);
      if (current && current.owner_uid === uid && !String(current.title ?? '').trim()) {
        const seed = chatStore.getFirstUserMessage({ sessionId: sid }) ?? userMessage;
        const title = await generateChatTitle(seed);
        if (title) chatStore.renameSession({ ownerUid: uid, sessionId: sid, title });
      }
    } catch {
      // Ignore title generation failures; chat still works.
    }
    reply.raw.end();
  });

  // ─── Interactive report building (web UI) ─────────────────────────────
  await app.register(reportBuildRoutes, {
    reportBuildService,
    authPreHandler: authHook?.preHandler,
  });

  await app.register(mailingRoutes, {
    prefsStore: mailingPrefsStore,
    mailingService,
    tryAuthPreHandler,
    isMailingConfigured,
    allowAnonymous: !authRequired,
  });

  await app.register(visitsRoutes, {
    visitsService,
    authPreHandler: authHook?.preHandler,
  });

  await app.register(chatbotManualReportsRoutes, {
    service: chatbotManualReportsService,
    authPreHandler: authHook?.preHandler,
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
    const whatsappConversationStore = createWhatsAppConversationStore(sqlitePath);
    const whatsappDraftStore = createWhatsAppReportDraftStore(sqlitePath);
    const whatsappApiAdapter = createMetaCloudApiAdapter({
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    });
    const whatsappResilienceAnalyzer = process.env.ANTHROPIC_API_KEY?.trim()
      ? createWhatsAppResilienceAnalyzer({ anthropicApiKey: process.env.ANTHROPIC_API_KEY.trim() })
      : null;
    const whatsappDraftGenerator = process.env.ANTHROPIC_API_KEY?.trim()
      ? createDraftGenerator({ anthropicApiKey: process.env.ANTHROPIC_API_KEY.trim() })
      : null;
    const whatsappIngestService = createWhatsAppIngestService({
      messageStore: whatsappMessageStore,
      apiAdapter: whatsappApiAdapter,
      evidenceStore,
      signalStore: whatsappSignalStore,
      resilienceAnalyzer: whatsappResilienceAnalyzer,
      draftGenerator: whatsappDraftGenerator,
      reportBuildService: reportBuildService
        ? createReportBuildService({
            analyzerPort: whatsappResilienceAnalyzer,
            draftGeneratorPort: whatsappDraftGenerator,
            conversationStore: whatsappConversationStore,
            draftStore: whatsappDraftStore,
          })
        : null,
      conversationStore: whatsappConversationStore,
      draftStore: whatsappDraftStore,
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

  // Root: serve SPA when built; otherwise return a small JSON health payload.
  app.get('/', async (_req, reply) => {
    try {
      const html = await readFile(resolve(clientDist, 'index.html'), 'utf8');
      return reply.type('text/html; charset=utf-8').send(html);
    } catch {
      return reply.send({
        ok: true,
        service: 'news',
        endpoints: {
          swagger: '/api/swagger',
          openapi: '/api/openapi.json',
          docsIndex: '/api/docs/index',
        },
      });
    }
  });

  return app;
}
