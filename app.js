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
import { defaultVideoDownloadDir } from './business_modules/video/infrastructure/videoDataPaths.js';
import { buildSecurityTxt } from './cross-cut-modules/security/app/buildSecurityTxt.js';
import { requireAuthPreHandler } from './cross-cut-modules/auth/requireAuthPreHandler.js';
import { tryAuthPreHandler } from './cross-cut-modules/auth/tryAuthPreHandler.js';
import { initFirebaseAdminForAuth } from './cross-cut-modules/auth/firebaseAdmin.js';
import { hasPrivilegedUserAccessConfigured } from './cross-cut-modules/auth/userAccess.js';
import { requireAnalystView } from './cross-cut-modules/auth/requireAnalystAccess.js';
import { createEvidenceDraftStore } from './cross-cut-modules/persistence/evidenceDraftStore.js';
import { createEvidenceStore } from './cross-cut-modules/persistence/evidenceStore.js';
import { createSourceArchive } from './cross-cut-modules/source_archive/createSourceArchive.js';
import { createRetrievalService } from './cross-cut-modules/retrieval/index.js';
import { createChatStore } from './business_modules/chat/infrastructure/chatStore.js';
import { createChatPendingActionStore } from './business_modules/chat/infrastructure/chatPendingActionStore.js';
import { AudioEvidenceIngestService } from './business_modules/audio/app/audioEvidenceIngestService.js';
import { contextualizeTranscript } from './business_modules/audio/app/audioTranscriptContextualizer.js';
import { OpenaiTranscriptionAdapter } from './business_modules/audio/infrastructure/adapters/openaiTranscriptionAdapter.js';
import { createHttpAudioDownloadAdapter } from './business_modules/audio/infrastructure/adapters/httpAudioDownloadAdapter.js';
import { createDriftService } from './business_modules/resilience/app/driftService.js';
import { registerDriftRoutes } from './business_modules/resilience/input/driftRoutes.js';
import {
  createMonitoringService,
  registerMonitoringRoutes,
} from './cross-cut-modules/monitoring/index.js';
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
import { createDefaultPboReportReviewService } from './business_modules/pbo_report_review/input/createPboReviewWiring.js';
import { createPboHistoricalSearchService } from './business_modules/pbo_report_review/app/pboHistoricalSearchService.js';
import { pboReviewRoutes } from './business_modules/pbo_report_review/input/pboReviewRoutes.js';
import { createVectorIndexStore } from './cross-cut-modules/vector_index/index.js';
import { evidenceRoutes } from './api/routes/evidenceRoutes.js';
import { chatRoutes } from './api/routes/chatRoutes.js';
import { reportRoutes } from './api/routes/reportRoutes.js';
import { authRoutes } from './cross-cut-modules/auth/authRoutes.js';
import { operatorRoutes } from './api/routes/operatorRoutes.js';
import { createValidationReviewSqliteStore } from './business_modules/resilience/validation/infrastructure/adapters/validationReviewSqliteStore.js';
import { createValidationReviewService } from './business_modules/resilience/validation/app/validationReviewService.js';
import { validationReviewRoutes } from './business_modules/resilience/validation/input/validationReviewRoutes.js';
import { createCatalogProposalSqliteStore } from './business_modules/catalogLearning/infrastructure/adapters/catalogProposalSqliteStore.js';
import { createCatalogProposalService } from './business_modules/catalogLearning/app/catalogProposalService.js';
import { catalogLearningRoutes } from './business_modules/catalogLearning/input/catalogLearningRoutes.js';
import { createGeoUnknownReviewService } from './business_modules/geo/app/geoUnknownReviewService.js';
import { docsRoutes, resolveProductDocsRoot } from './api/routes/docsRoutes.js';
import {
  registerSecurityPlugins,
  registerWhatsappRawBodyHook,
} from './cross-cut-modules/security/input/registerSecurityPlugins.js';
import { registerEarlyAuthForRateLimit } from './cross-cut-modules/security/input/earlyAuthForRateLimit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Max characters stored for evidence draft (SQLite TEXT + API body). */
const MAX_EVIDENCE_DRAFT_CHARS = 500_000;

const sqlitePath = process.env.SQLITE_PATH?.trim()
  ? resolve(process.env.SQLITE_PATH.trim())
  : resolve(__dirname, 'db', 'app.sqlite');

const evidenceDraftStore = createEvidenceDraftStore(sqlitePath);
const evidenceStore = createEvidenceStore(sqlitePath);
const articleTimezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';
const retrievalService = createRetrievalService({
  dbPath: sqlitePath,
  timezone: articleTimezone,
});

function contextualizeTranscriptWithRag(segments, opts = {}) {
  return contextualizeTranscript(segments, {
    ...opts,
    retrievalService,
  });
}

const sourceArchive = createSourceArchive(sqlitePath, {
  retrievalIndexer: retrievalService,
});
const chatStore = createChatStore(sqlitePath);
const chatPendingActionStore = createChatPendingActionStore(sqlitePath);
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
  retrievalService,
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
  repository: createReportBotManualReportsFsAdapter(),
});

const pboRegionalDailyService = createPboRegionalDailyService({
  repository: createPboReportRegionalFsAdapter(),
  rootDir: __dirname,
});

const poolService = createDefaultPoolService();

const { geoService, geoEnrichmentPort, geoUnknownReviewQueue } = createGeoWiring({
  rootDir: __dirname,
  unknownSourceType: 'whatsapp',
  sqlitePath,
});

const geoUnknownReviewService = createGeoUnknownReviewService({
  queueAdapter: geoUnknownReviewQueue,
});

const catalogProposalStore = createCatalogProposalSqliteStore(sqlitePath);
const catalogProposalService = createCatalogProposalService({
  proposalStore: catalogProposalStore,
  retrievalService,
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

const pboReportReviewService = createDefaultPboReportReviewService({
  repoRoot: __dirname,
  sqlitePath,
});
const pboHistoricalSearchService = createPboHistoricalSearchService({
  retrievalService,
});

const validationReviewStore = createValidationReviewSqliteStore(sqlitePath);
const validationReviewService = createValidationReviewService({
  store: validationReviewStore,
  evidenceStore,
  sourceArchive,
  retrievalService,
  storyClusterIndex: retrievalService.storyClusterIndex,
  reportsDir: resolve(__dirname, 'reports'),
});

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
    : defaultVideoDownloadDir();

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
    contextualizeTranscript: contextualizeTranscriptWithRag,
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
    geoLocalityPort: geoService,
    retrievalService,
    sourceArchive,
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
    sourceArchive,
    signalStore: whatsappSignalStore,
    resilienceAnalyzer: whatsappResilienceAnalyzer,
    draftGenerator: whatsappDraftGenerator,
    reportBuildService: reportBuildService
      ? createReportBuildService({
        analyzerPort: whatsappResilienceAnalyzer,
        draftGeneratorPort: whatsappDraftGenerator,
        conversationStore: whatsappConversationStore,
        draftStore: whatsappDraftStore,
        geoLocalityPort: geoService,
        retrievalService,
        sourceArchive,
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
    appSecret: process.env.WHATSAPP_APP_SECRET,
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
  const needsFirebase = (
    authRequired
    || !!process.env.RESILIENCE_MAINTAINER_EMAILS?.trim()
    || !!process.env.RESILIENCE_ANALYST_EMAILS?.trim()
    || hasPrivilegedUserAccessConfigured()
  ) && firebaseProjectId;
  if (needsFirebase) {
    initFirebaseAdminForAuth(firebaseProjectId);
  }

  const authHook = authRequired ? { preHandler: requireAuthPreHandler } : {};
  const tryAuthHook = authRequired ? { preHandler: tryAuthPreHandler } : {};

  const trustProxy =
    process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production';

  const app = Fastify({
    logger: false,
    bodyLimit: 10 * 1024 * 1024 /* 10 MB */,
    trustProxy,
  });

  app.decorate('geoService', geoService);
  app.decorate('poolService', poolService);

  registerWhatsappRawBodyHook(app);
  registerEarlyAuthForRateLimit(app, { authRequired });
  await registerSecurityPlugins(app, { authRequired });

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
    const enableSwaggerUi =
      process.env.ENABLE_SWAGGER === 'true' || process.env.NODE_ENV !== 'production';
    if (enableSwaggerUi) {
      await app.register(fastifySwaggerUi, {
        routePrefix: '/api/swagger',
        uiConfig: { docExpansion: 'list' },
      });
    }
  }

  const evidenceUserUploadsRoot = resolve(__dirname, 'db', 'evidence-uploads');
  const { videoDownloadDir, videoGrabService, youtubeEvidenceIngestService } = createVideoServices();
  const reportBuildService = createReportBuildServiceIfConfigured();

  await docsRoutes(app, {
    retrievalService,
    authRequired,
    tryAuthHook,
    productDocsRoot: resolveProductDocsRoot(__dirname),
    openapiDocument,
  });

  await authRoutes(app, { authRequired });

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

  await app.register(validationReviewRoutes, {
    validationReviewService,
    authPreHandler: authHook?.preHandler,
    retrievalService,
  });

  await operatorRoutes(app);

  const driftService = createDriftService({});

  await app.register(catalogLearningRoutes, {
    catalogProposalService,
    authPreHandler: authHook?.preHandler,
  });

  await chatRoutes(app, {
    authHook,
    chatStore,
    chatOwnerUid,
    timezone,
    evidenceStore,
    sourceArchive,
    vectorIndexStore,
    retrievalService,
    pendingActionStore: chatPendingActionStore,
    validationReviewService,
    pboHistoricalSearchService,
    pboReportReviewService,
    driftService,
    catalogProposalService,
    geoUnknownReviewService,
  });
  await registerDriftRoutes(app, {
    driftService,
    authPreHandler: authHook?.preHandler,
  });

  const monitoringService = createMonitoringService({
    rootDir: __dirname,
    timezone,
    sqlitePath,
  });
  await registerMonitoringRoutes(app, {
    monitoringService,
    authPreHandler: authHook?.preHandler,
    requireAnalystView,
    timezone,
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
    geoUnknownReviewService,
  });

  await registerPoolRoutes(app, {
    authPreHandler: authHook?.preHandler,
    poolService,
  });

  await evidenceRoutes(app, {
    authHook,
    evidenceDraftStore,
    evidenceStore,
    sourceArchive,
    maxEvidenceDraftChars: MAX_EVIDENCE_DRAFT_CHARS,
    evidenceUserUploadsRoot,
    videoDownloadDir,
    videoGrabService,
    youtubeEvidenceIngestService,
    getAudioEvidenceIngestService,
    evidenceOwnerKey,
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

  await app.register(pboReviewRoutes, {
    pboReportReviewService,
    pboHistoricalSearchService,
    authPreHandler: authHook?.preHandler,
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

  app.get('/.well-known/security.txt', async (_req, reply) => {
    if (process.env.NODE_ENV === 'production') {
      const txt = buildSecurityTxt();
      return reply.type('text/plain; charset=utf-8').send(txt);
    }
    try {
      const txt = await readFile(resolve(__dirname, '.well-known', 'security.txt'), 'utf8');
      return reply.type('text/plain; charset=utf-8').send(txt);
    } catch {
      return reply.code(404).send('Not found');
    }
  });

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
