import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import YAML from 'yaml';
import { createReportReadPort, createReportDisplayPort } from '../business_modules/resilience_scorer/index.js';
import { createClaudeChatAdapter } from '../business_modules/chat/infrastructure/adapters/claudeChatAdapter.js';
import { createStubChatAdapter } from '../business_modules/chat/infrastructure/adapters/stubChatAdapter.js';
import { getMunicipalityDashboard } from '../business_modules/pbo_report/index.js';
import { registerAppErrorHandler } from '../cross-cut-modules/errors/index.js';
import {
  getDefaultEventBus,
  registerModuleHandlers,
} from '../cross-cut-modules/messaging/index.js';
import { dispatchOutboxBatch } from '../cross-cut-modules/messaging/app/outboxDispatcher.js';
import { buildSecurityTxt } from '../cross-cut-modules/security/app/buildSecurityTxt.js';
import {
  buildAuthHook,
  buildReadAuthHook,
  buildTryAuthHook,
  getProtectedAuthPreHandlers,
} from '../cross-cut-modules/auth/buildAuthHooks.js';
import { setAppCheckSoftMetricsPort } from '../cross-cut-modules/security/input/appCheckPreHandler.js';
import { tryAuthPreHandler } from '../cross-cut-modules/auth/tryAuthPreHandler.js';
import { initFirebaseAdminForAuth } from '../cross-cut-modules/auth/firebaseAdmin.js';
import { syncAllUserAccessClaims } from '../cross-cut-modules/auth/userAccessClaims.js';
import { hasPrivilegedUserAccessConfigured } from '../cross-cut-modules/auth/userAccess.js';
import { requireDeveloperView } from '../cross-cut-modules/auth/requireDeveloperAccess.js';
import {
  createMonitoringService,
  registerMonitoringRoutes,
} from '../cross-cut-modules/monitoring/index.js';
import { registerHttpMetricsHooks } from '../cross-cut-modules/monitoring/input/registerHttpMetricsHooks.js';
import { startRuntimeGauges } from '../cross-cut-modules/monitoring/infrastructure/adapters/runtimeGauges.js';
import { getActiveStreamCount } from '../cross-cut-modules/monitoring/app/activeStreams.js';
import {
  createSearchTrendsService,
  registerSearchTrendsRoutes,
} from '../business_modules/search_trends/index.js';
import { listIsraelDistrictsForApi } from '../cross-cut-modules/geo/israelDistricts.js';
import { registerPoolRoutes } from '../business_modules/pool/index.js';
import { registerGeoRoutes } from '../business_modules/geo/input/geoRoutes.js';
import { visitsRoutes } from '../business_modules/visits/index.js';
import { socialMediaRoutes } from '../business_modules/social_media/index.js';
import { newsSitesRoutes } from '../business_modules/news-sites/index.js';
import { radioRoutes } from '../business_modules/audio/index.js';
import { reportBotManualReportsRoutes } from '../business_modules/report_bot/index.js';
import { reportBuildRoutes } from '../business_modules/report_build/input/reportBuildRoutes.js';
import { mailingRoutes } from '../business_modules/mailing/input/mailingRoutes.js';
import { createTourService, tourRoutes } from '../business_modules/product_tour/index.js';
import { pboReviewRoutes } from '../business_modules/pbo_report_review/input/pboReviewRoutes.js';
import { evidenceRoutes } from '../business_modules/evidence_submission/input/evidenceRoutes.js';
import { chatRoutes } from '../business_modules/chat/input/chatRoutes.js';
import { registerCrisisBudgetRoutes } from '../cross-cut-modules/budget/index.js';
import { reportRoutes } from '../business_modules/resilience_scorer/input/reportRoutes.js';
import { authRoutes } from '../cross-cut-modules/auth/authRoutes.js';
import { userRoutes } from '../cross-cut-modules/monitoring/input/userRoutes.js';
import { docsRoutes, resolveProductDocsRoot } from '../cross-cut-modules/docs/input/docsRoutes.js';
import { maybeLocalize } from '../business_modules/translation/index.js';
import {
  registerSecurityPlugins,
  registerWhatsappRawBodyHook,
} from '../cross-cut-modules/security/input/registerSecurityPlugins.js';
import { registerEarlyAuthForRateLimit } from '../cross-cut-modules/security/input/earlyAuthForRateLimit.js';
import { wireApplication } from './wireApplication.js';
import { MAX_EVIDENCE_DRAFT_CHARS } from './registerPlatform.js';
import { chatOwnerUid, evidenceOwnerKey } from './registerMedia.js';
import { createArticlesFetcher } from './registerIngestion.js';

async function loadOpenApiDocument(repoRoot) {
  const openapiPath = resolve(repoRoot, 'openapi', 'openapi.yaml');
  try {
    return YAML.parse(await readFile(openapiPath, 'utf8'));
  } catch {
    return null;
  }
}

async function registerOpenApi(app, repoRoot) {
  const openapiDocument = await loadOpenApiDocument(repoRoot);
  if (!openapiDocument) return null;

  await app.register(fastifySwagger, { openapi: openapiDocument });
  const enableSwaggerUi =
    process.env.ENABLE_SWAGGER === 'true' || process.env.NODE_ENV !== 'production';
  if (enableSwaggerUi) {
    await app.register(fastifySwaggerUi, {
      routePrefix: '/api/swagger',
      uiConfig: { docExpansion: 'list' },
    });
  }
  return openapiDocument;
}

function setupOutboxDispatcher(app, w, eventBus) {
  const outboxIntervalMs = w.config?.outboxDispatchIntervalMs ?? 5000;
  let outboxTimer = null;
  if (w.outboxStore && outboxIntervalMs > 0) {
    outboxTimer = setInterval(() => {
      void dispatchOutboxBatch(w.outboxStore, eventBus);
    }, outboxIntervalMs);
    if (typeof outboxTimer?.unref === 'function') outboxTimer.unref();
    void dispatchOutboxBatch(w.outboxStore, eventBus);
  }
  app.addHook('onClose', async () => {
    if (outboxTimer) clearInterval(outboxTimer);
  });
}

async function syncUserClaimsOnStart(needsFirebase) {
  if (process.env.SYNC_USER_CLAIMS_ON_START !== 'true' || !needsFirebase) return;
  try {
    const claimResults = await syncAllUserAccessClaims();
    const failed = claimResults.filter((r) => !r.ok);
    if (failed.length > 0) {
      console.warn(`[auth] custom claims sync: ${failed.length} failed`, failed.slice(0, 5));
    } else {
      console.log(`[auth] custom claims synced for ${claimResults.length} users`);
    }
  } catch (err) {
    console.warn('[auth] custom claims sync on start failed:', err?.message ?? err);
  }
}

async function registerSecurityTxtRoute(app, repoRoot) {
  app.get('/.well-known/security.txt', async (_req, reply) => {
    if (process.env.NODE_ENV === 'production') {
      const txt = buildSecurityTxt();
      return reply.type('text/plain; charset=utf-8').send(txt);
    }
    try {
      const txt = await readFile(resolve(repoRoot, '.well-known', 'security.txt'), 'utf8');
      return reply.type('text/plain; charset=utf-8').send(txt);
    } catch {
      return reply.code(404).send('Not found');
    }
  });
}

async function registerStaticServing(app, repoRoot, serveStatic) {
  const clientDist = resolve(repoRoot, 'client', 'dist');
  if (serveStatic) {
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
    return;
  }

  app.get('/', async (_req, reply) => {
    return reply.send({
      ok: true,
      service: 'news-api',
      mode: 'api-only',
      endpoints: {
        swagger: '/api/swagger',
        openapi: '/api/openapi.json',
        docsIndex: '/api/docs/index',
      },
    });
  });

  app.setNotFoundHandler(async (req, reply) => {
    const urlPath = String(req.url ?? '').split('?')[0];
    if (urlPath.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return reply.code(404).send({ error: 'Not found' });
  });
}

async function registerApplicationRoutes(app, ctx) {
  const {
    w,
    authRequired,
    authHook,
    readAuthHook,
    tryAuthHook,
    protectedAuthPreHandler,
    timezone,
    fetchArticlesForDay,
    openapiDocument,
    evidenceUserUploadsRoot,
    videoDownloadDir,
    videoGrabService,
    youtubeEvidenceIngestService,
    reportBuildService,
  } = ctx;

  await docsRoutes(app, {
    retrievalService: w.retrievalService,
    authRequired,
    tryAuthHook,
    productDocsRoot: resolveProductDocsRoot(w.repoRoot),
    openapiDocument,
    maybeLocalize,
  });

  await authRoutes(app, { authRequired });

  await reportRoutes(app, {
    authHook,
    readAuthHook,
    tryAuthPreHandler,
    evidenceStore: w.evidenceStore,
    reportReadPort: createReportReadPort(),
    videoDownloadDir,
    videoGrabService,
    pboRegionalDailyService: w.pboRegionalDailyService,
    timezone,
    fetchArticlesForDay,
    sqlitePath: w.sqlitePath,
    crisisBudgetService: w.crisisBudgetService ?? null,
    geoUnknownReviewService: w.geoUnknownReviewService ?? null,
  });

  await userRoutes(app);

  await chatRoutes(app, {
    authHook,
    chatStore: w.chatStore,
    chatOwnerUid,
    timezone,
    evidenceStore: w.evidenceStore,
    sourceArchive: w.sourceArchive,
    vectorIndexStore: w.vectorIndexStore,
    retrievalService: w.retrievalService,
    pendingActionStore: w.chatPendingActionStore,
    signalFlagStore: w.signalFlagStore,
    pboHistoricalSearchService: w.pboHistoricalSearchService,
    pboReportReviewService: w.pboReportReviewService,
    getMunicipalityDashboard,
    geoUnknownReviewService: w.geoUnknownReviewService,
    llmPort: w.sharedLlmPort,
    agentKernel: w.agentKernel,
    tracePort: w.tracePort,
    reportReadPort: createReportReadPort(),
    reportDisplayPort: createReportDisplayPort(),
    chatLlmPort: ctx.chatLlmStub ? createStubChatAdapter() : createClaudeChatAdapter(),
    crisisBudgetService: w.crisisBudgetService ?? null,
    metricsPort: w.metricsPort,
  });

  await registerCrisisBudgetRoutes(app, {
    authHook,
    crisisBudgetService: w.crisisBudgetService ?? null,
  });

  const monitoringService = createMonitoringService({
    rootDir: w.repoRoot,
    timezone,
    sqlitePath: w.sqlitePath,
    metricsPort: w.metricsPort,
    tracePort: w.tracePort,
    getLoopDelayMs: ctx.getLoopDelayMs ?? null,
  });
  await registerMonitoringRoutes(app, {
    monitoringService,
    authPreHandler: protectedAuthPreHandler,
    // In no-auth mode (local dev / loadtest) there is no user identity to
    // gate on; every other route is already open in that mode.
    requireDeveloperView: authRequired ? requireDeveloperView : null,
    timezone,
  });

  const searchTrendsService = createSearchTrendsService({});
  await registerSearchTrendsRoutes(app, {
    searchTrendsService,
    authPreHandler: protectedAuthPreHandler,
  });

  app.get('/api/districts', authHook, async (_request, reply) => {
    return reply.send({ districts: listIsraelDistrictsForApi() });
  });

  await registerGeoRoutes(app, {
    authPreHandler: protectedAuthPreHandler,
    geoUnknownReviewService: w.geoUnknownReviewService,
  });

  await registerPoolRoutes(app, {
    authPreHandler: protectedAuthPreHandler,
    poolService: w.poolService,
  });

  await evidenceRoutes(app, {
    authHook,
    evidenceDraftStore: w.evidenceDraftStore,
    evidenceStore: w.evidenceStore,
    sourceArchive: w.sourceArchive,
    maxEvidenceDraftChars: MAX_EVIDENCE_DRAFT_CHARS,
    evidenceUserUploadsRoot,
    videoDownloadDir,
    videoGrabService,
    youtubeEvidenceIngestService,
    getAudioEvidenceIngestService: w.media.getAudioEvidenceIngestService,
    evidenceOwnerKey,
    outboxStore: w.outboxStore,
  });

  await app.register(reportBuildRoutes, {
    reportBuildService,
    authPreHandler: protectedAuthPreHandler,
  });

  await app.register(mailingRoutes, {
    prefsStore: w.mailingPrefsStore,
    mailingService: w.mailingService,
    tryAuthPreHandler,
    isMailingConfigured: w.isMailingConfigured,
    allowAnonymous: !authRequired,
  });

  await app.register(tourRoutes, {
    tourService: createTourService({ store: w.tourProgressStore }),
    tryAuthPreHandler,
    allowAnonymous: !authRequired,
  });

  await app.register(pboReviewRoutes, {
    pboReportReviewService: w.pboReportReviewService,
    pboHistoricalSearchService: w.pboHistoricalSearchService,
    authPreHandler: protectedAuthPreHandler,
  });

  await app.register(visitsRoutes, {
    visitsService: w.visitsService,
    authPreHandler: protectedAuthPreHandler,
  });

  await app.register(socialMediaRoutes, {
    socialMediaService: w.socialMediaService,
    authPreHandler: protectedAuthPreHandler,
  });

  await app.register(newsSitesRoutes, {
    newsSitesService: w.newsSitesService,
    authPreHandler: protectedAuthPreHandler,
  });

  await app.register(radioRoutes, {
    radioIngestReadService: w.radioIngestReadService,
    authPreHandler: protectedAuthPreHandler,
  });

  await app.register(reportBotManualReportsRoutes, {
    service: w.reportBotManualReportsService,
    authPreHandler: protectedAuthPreHandler,
  });

  await w.media.registerWhatsappWebhook(app, reportBuildService);
}

/**
 * @param {{ apiKey: string, fetchArticlesForDay: (opts: { date: string }) => Promise<Array>, timezone?: string, authRequired?: boolean }} options
 */
export async function createApp(options) {
  const w = wireApplication();
  const apiKey = options?.apiKey?.trim?.() ?? '';
  if (!apiKey) {
    throw new Error('API key is required (set NEWSAPI_API_KEY in .env)');
  }

  const timezone = options.timezone || w.articleTimezone;
  const fetchArticlesForDay = options.fetchArticlesForDay
    ?? createArticlesFetcher({ apiKey, timezone });

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

  const authHook = buildAuthHook(authRequired);
  const readAuthHook = buildReadAuthHook(authRequired);
  setAppCheckSoftMetricsPort(w.metricsPort);
  const tryAuthHook = buildTryAuthHook(authRequired);
  const protectedAuthPreHandler = getProtectedAuthPreHandlers(authRequired);

  await syncUserClaimsOnStart(needsFirebase);

  const trustProxy = w.config?.trustProxy
    ?? (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production');

  const app = Fastify({
    logger: false,
    bodyLimit: 10 * 1024 * 1024 /* 10 MB */,
    trustProxy,
  });

  registerAppErrorHandler(app);
  registerHttpMetricsHooks(app, { metricsPort: w.metricsPort });
  const runtimeGauges = startRuntimeGauges({
    metricsPort: w.metricsPort,
    getActiveSseStreams: getActiveStreamCount,
  });
  app.addHook('onClose', async () => {
    runtimeGauges.stop();
  });
  const eventBus = getDefaultEventBus();
  registerModuleHandlers(eventBus, {
    processedEvents: w.processedEventStore,
    retrievalService: w.retrievalService,
  });

  setupOutboxDispatcher(app, w, eventBus);

  app.decorate('geoService', w.geoService);
  app.decorate('poolService', w.poolService);

  registerWhatsappRawBodyHook(app);
  registerEarlyAuthForRateLimit(app, { authRequired });
  await registerSecurityPlugins(app, { authRequired });

  await app.register(multipart, {
    limits: {
      fileSize: Number(process.env.EVIDENCE_MAX_FILE_BYTES) || 100 * 1024 * 1024,
      files: 25,
    },
  });

  const openapiDocument = await registerOpenApi(app, w.repoRoot);

  const evidenceUserUploadsRoot = resolve(w.repoRoot, 'db', 'evidence-uploads');
  const { videoDownloadDir, videoGrabService, youtubeEvidenceIngestService } =
    w.media.createVideoServices();
  const reportBuildService = w.media.createReportBuildServiceIfConfigured();

  const chatLlmStub = process.env.CHAT_LLM_STUB === 'true';
  if (chatLlmStub) {
    console.warn('[loadtest] CHAT_LLM_STUB active — chat responses are fake, no LLM spend');
  }

  await registerApplicationRoutes(app, {
    w,
    authRequired,
    authHook,
    readAuthHook,
    tryAuthHook,
    protectedAuthPreHandler,
    timezone,
    fetchArticlesForDay,
    openapiDocument,
    evidenceUserUploadsRoot,
    videoDownloadDir,
    videoGrabService,
    youtubeEvidenceIngestService,
    reportBuildService,
    chatLlmStub,
    getLoopDelayMs: runtimeGauges.getLoopDelayP99Ms,
  });

  await registerSecurityTxtRoute(app, w.repoRoot);

  const serveStatic = w.config?.serveStatic !== false;
  await registerStaticServing(app, w.repoRoot, serveStatic);

  return app;
}
