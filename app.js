import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import YAML from 'yaml';
import { getCachedReport } from './api/analysisService.js';
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
import { AudioEvidenceIngestService } from './business_modules/audio/app/audioEvidenceIngestService.js';
import { contextualizeTranscript } from './business_modules/audio/app/audioTranscriptContextualizer.js';
import { OpenaiTranscriptionAdapter } from './business_modules/audio/infrastructure/adapters/openaiTranscriptionAdapter.js';
import { createHttpAudioDownloadAdapter } from './business_modules/audio/infrastructure/adapters/httpAudioDownloadAdapter.js';
import { createDriftService } from './business_modules/resilience/app/driftService.js';
import { registerDriftRoutes } from './business_modules/resilience/input/driftRoutes.js';
import {
  createSearchTrendsService,
  registerSearchTrendsRoutes,
} from './business_modules/search_trends/index.js';
import { listIsraelDistrictsForApi } from './cross-cut-modules/geo/israelDistricts.js';
import { createDefaultPoolService, registerPoolRoutes } from './business_modules/pool/index.js';
import {
  createPboRegionalDailyService,
  createPboReportRegionalFsAdapter,
} from './business_modules/pbo_report_regional/index.js';
import { registerGeoRoutes } from './business_modules/geo/input/geoRoutes.js';
import { createGeoWiring } from './cross-cut-modules/geo/createGeoWiring.js';
import { createVisitsFsAdapter, createVisitsService, visitsRoutes } from './business_modules/visits/index.js';
import { createSocialMediaService, socialMediaRoutes } from './business_modules/social_media/index.js';
import {
  createNewsSitesFsAdapter,
  createNewsSitesService,
  newsSitesRoutes,
} from './business_modules/news-sites/index.js';
import {
  createRadioFsAdapter,
  createRadioIngestReadService,
  radioRoutes,
} from './business_modules/audio/index.js';
import {
  reportBotManualReportsRoutes,
  createReportBotManualReportsFsAdapter,
  createReportBotManualReportsService,
} from './business_modules/report_bot/index.js';
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
import { createVectorIndexStore } from './cross-cut-modules/vector_index/index.js';
import { evidenceRoutes } from './api/routes/evidenceRoutes.js';
import { chatRoutes } from './api/routes/chatRoutes.js';
import { reportRoutes } from './api/routes/reportRoutes.js';
import { docsRoutes, resolveProductDocsRoot } from './api/routes/docsRoutes.js';

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

const socialMediaService = createSocialMediaService({
  dataDir: resolve(__dirname, 'business_modules', 'social_media', 'data'),
});

const newsSitesService = createNewsSitesService({
  repository: createNewsSitesFsAdapter({ rootDir: __dirname }),
  rootDir: __dirname,
});

const radioIngestReadService = createRadioIngestReadService({
  repository: createRadioFsAdapter({ rootDir: __dirname }),
  rootDir: __dirname,
});

const reportBotManualReportsService = createReportBotManualReportsService({
  repository: createReportBotManualReportsFsAdapter({ rootDir: __dirname }),
});

const pboRegionalDailyService = createPboRegionalDailyService({
  repository: createPboReportRegionalFsAdapter({
    dataDir: resolve(__dirname, 'business_modules', 'pbo_report_regional', 'data'),
  }),
});

const poolService = createDefaultPoolService();

const { geoService, geoEnrichmentPort } = createGeoWiring({
  rootDir: __dirname,
  unknownSourceType: 'whatsapp',
  sqlitePath,
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
    poolService,
  })
  : null;

let audioEvidenceIngestService = null;

function evidenceOwnerKey(request) {
  return request.user?.uid ?? 'anonymous';
}

function chatOwnerUid(request) {
  return request.user?.uid ?? 'anonymous';
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

function createVideoServices() {
  const videoDownloadDir = process.env.VIDEO_DOWNLOAD_DIR?.trim()
    ? resolve(process.env.VIDEO_DOWNLOAD_DIR)
    : resolve(__dirname, 'downloads', 'video');

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
      ingestAudioFileToEvidenceItems: (...args) =>
        getAudioEvidenceIngestService().ingestAudioFileToEvidenceItems(...args),
    },
    contextualizeTranscript,
  });

  return { videoDownloadDir, videoGrabService, youtubeEvidenceIngestService };
}

function createReportBuildServiceIfConfigured() {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return null;
  return createReportBuildService({
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
  });
}

async function registerWhatsappWebhook(app, reportBuildService) {
  if (!process.env.WHATSAPP_VERIFY_TOKEN) return;

  const whatsappMessageStore = createWhatsAppMessageStore(sqlitePath);
  const whatsappSignalStore = createWhatsAppSignalStore(sqlitePath);
  const whatsappConversationStore = createWhatsAppConversationStore(sqlitePath);
  const whatsappDraftStore = createWhatsAppReportDraftStore(sqlitePath);
  const whatsappApiAdapter = createMetaCloudApiAdapter({
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  });
  const whatsappResilienceAnalyzer = process.env.ANTHROPIC_API_KEY?.trim()
    ? createWhatsAppResilienceAnalyzer({
      anthropicApiKey: process.env.ANTHROPIC_API_KEY.trim(),
      geoEnrichmentPort,
    })
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
    allowedGroupIds: (process.env.WHATSAPP_ALLOWED_GROUP_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  });
  await app.register(whatsappWebhookPlugin, {
    ingestService: whatsappIngestService,
    apiAdapter: whatsappApiAdapter,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
  });
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

  const firebaseProjectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const needsFirebase = (authRequired || !!process.env.RESILIENCE_MAINTAINER_EMAILS?.trim()) && firebaseProjectId;
  if (needsFirebase) {
    initFirebaseAdminForAuth(firebaseProjectId);
  }

  const authHook = authRequired ? { preHandler: requireAuthPreHandler } : {};
  const tryAuthHook = authRequired ? { preHandler: tryAuthPreHandler } : {};

  const app = Fastify({ logger: false, bodyLimit: 10 * 1024 * 1024 /* 10 MB */ });

  app.decorate('geoService', geoService);
  app.decorate('poolService', poolService);

  await app.register(multipart, {
    limits: {
      fileSize: Number(process.env.EVIDENCE_MAX_FILE_BYTES) || 100 * 1024 * 1024,
      files: 25,
    },
  });

  const openapiPath = resolve(__dirname, 'openapi', 'openapi.yaml');
  let openapiDocument = null;
  try {
    openapiDocument = YAML.parse(await readFile(openapiPath, 'utf8'));
  } catch {
    /* OpenAPI optional */
  }

  if (openapiDocument) {
    await app.register(fastifySwagger, { openapi: openapiDocument });
    await app.register(fastifySwaggerUi, {
      routePrefix: '/api/swagger',
      uiConfig: { docExpansion: 'list' },
    });
  }

  const evidenceUserUploadsRoot = resolve(__dirname, 'data', 'evidence-uploads');
  const { videoDownloadDir, videoGrabService, youtubeEvidenceIngestService } = createVideoServices();
  const reportBuildService = createReportBuildServiceIfConfigured();

  await docsRoutes(app, {
    authRequired,
    tryAuthHook,
    productDocsRoot: resolveProductDocsRoot(__dirname),
    openapiDocument,
  });

  await reportRoutes(app, {
    authHook,
    tryAuthPreHandler,
    evidenceStore,
    videoDownloadDir,
    videoGrabService,
    pboRegionalDailyService,
    timezone,
    fetchArticlesForDay,
  });

  const driftService = createDriftService({});
  await registerDriftRoutes(app, {
    driftService,
    authPreHandler: authHook?.preHandler,
  });

  const searchTrendsService = createSearchTrendsService({});
  await registerSearchTrendsRoutes(app, {
    searchTrendsService,
    authPreHandler: authHook?.preHandler,
  });

  app.get('/api/districts', authHook, async (_request, reply) => {
    return reply.send({ districts: listIsraelDistrictsForApi() });
  });

  await registerGeoRoutes(app, {
    authPreHandler: authHook?.preHandler,
  });

  await registerPoolRoutes(app, {
    authPreHandler: authHook?.preHandler,
    poolService,
  });

  await evidenceRoutes(app, {
    authHook,
    evidenceDraftStore,
    evidenceStore,
    maxEvidenceDraftChars: MAX_EVIDENCE_DRAFT_CHARS,
    evidenceUserUploadsRoot,
    videoDownloadDir,
    videoGrabService,
    youtubeEvidenceIngestService,
    getAudioEvidenceIngestService,
    evidenceOwnerKey,
  });

  await chatRoutes(app, {
    authHook,
    chatStore,
    chatOwnerUid,
    timezone,
    evidenceStore,
    vectorIndexStore,
  });

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

  await app.register(socialMediaRoutes, {
    socialMediaService,
    authPreHandler: authHook?.preHandler,
  });

  await app.register(newsSitesRoutes, {
    newsSitesService,
    authPreHandler: authHook?.preHandler,
  });

  await app.register(radioRoutes, {
    radioIngestReadService,
    authPreHandler: authHook?.preHandler,
  });

  await app.register(reportBotManualReportsRoutes, {
    service: reportBotManualReportsService,
    authPreHandler: authHook?.preHandler,
  });

  await registerWhatsappWebhook(app, reportBuildService);

  const clientDist = resolve(__dirname, 'client', 'dist');
  await app.register(fastifyStatic, { root: clientDist, prefix: '/' });

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

  app.setNotFoundHandler(async (req, reply) => {
    const urlPath = String(req.url ?? '').split('?')[0];
    if (urlPath.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    if (/\.[a-zA-Z0-9]+$/.test(urlPath)) {
      return reply.code(404).send({ error: 'Not found' });
    }
    try {
      const html = await readFile(resolve(clientDist, 'index.html'), 'utf8');
      return reply.type('text/html; charset=utf-8').send(html);
    } catch {
      return reply.code(404).send({ error: 'Not found' });
    }
  });

  return app;
}
