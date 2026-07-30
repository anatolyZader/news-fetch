import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { buildContentSecurityPolicyDirectives } from '../app/buildContentSecurityPolicy.js';
import { registerSecurityAuditHooks } from './auditLog.js';

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ authRequired?: boolean }} [opts]
 */
export async function registerSecurityPlugins(app, _opts = {}) {
  registerSecurityAuditHooks(app);
  const enableHsts = process.env.ENABLE_HSTS === 'true';
  const useCsp = process.env.ENABLE_STRICT_CSP === 'true' || process.env.NODE_ENV !== 'production';

  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: useCsp
      ? { directives: buildContentSecurityPolicyDirectives() }
      : false,
    // Firebase signInWithPopup needs window.closed on the Google OAuth popup; helmet's
    // default COOP "same-origin" isolates the popup and surfaces auth/popup-closed-by-user.
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    strictTransportSecurity: enableHsts
      ? { maxAge: 31536000, includeSubDomains: true }
      : false,
  });

  const globalMax = envInt('RATE_LIMIT_GLOBAL_MAX', 120);
  const globalWindow = envInt('RATE_LIMIT_GLOBAL_WINDOW_MS', 60_000);

  await app.register(rateLimit, {
    global: true,
    max: globalMax,
    timeWindow: globalWindow,
    hook: 'onRequest',
    allowList: (request) => {
      const path = request.url.split('?')[0];
      if (!path.startsWith('/api/')) return true;
      if (path === '/api/monitoring/health') return true;
      return false;
    },
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded, retry in ${context.after}`,
    }),
  });

  const routeLimits = [
    { method: 'POST', url: '/api/chat', max: envInt('RATE_LIMIT_CHAT_MAX', 15), key: 'uidOrIp' },
    {
      method: 'POST',
      url: '/api/evidence-submit',
      max: envInt('RATE_LIMIT_EVIDENCE_SUBMIT_MAX', 10),
      key: 'uid',
    },
    {
      method: 'POST',
      url: '/api/evidence-upload',
      max: envInt('RATE_LIMIT_EVIDENCE_UPLOAD_MAX', 10),
      key: 'uid',
    },
    {
      method: 'POST',
      url: '/api/social-media/fetch-topic',
      max: envInt('RATE_LIMIT_FETCH_TOPIC_MAX', 5),
      key: 'uid',
    },
    {
      method: 'POST',
      url: '/api/translate',
      max: envInt('RATE_LIMIT_TRANSLATE_MAX', 20),
      key: 'uid',
    },
    {
      method: 'POST',
      url: '/api/report-build/start',
      max: envInt('RATE_LIMIT_REPORT_BUILD_START_MAX', 10),
      key: 'uid',
    },
    {
      method: 'POST',
      url: '/api/report-build/turn',
      max: envInt('RATE_LIMIT_REPORT_BUILD_TURN_MAX', 20),
      key: 'uid',
    },
    {
      method: 'POST',
      url: '/api/report-build/suggest',
      max: envInt('RATE_LIMIT_REPORT_BUILD_SUGGEST_MAX', 30),
      key: 'uid',
    },
    {
      method: 'POST',
      url: '/api/signal-catalog-evolution/proposals/generate',
      max: envInt('RATE_LIMIT_CATALOG_GENERATE_MAX', 5),
      key: 'uid',
    },
    {
      method: 'POST',
      url: '/api/validation/review-queue/:date/:scope/:articleKey/explain',
      max: envInt('RATE_LIMIT_VALIDATION_EXPLAIN_MAX', 10),
      key: 'uid',
    },
    {
      method: 'POST',
      url: '/api/validation/review-queue/:date/:scope/:articleKey/agent',
      max: envInt('RATE_LIMIT_VALIDATION_AGENT_MAX', 8),
      key: 'uid',
    },
    {
      method: 'GET',
      url: '/api/validation/review-queue/:date/:scope/:articleKey/context',
      max: envInt('RATE_LIMIT_VALIDATION_CONTEXT_MAX', 30),
      key: 'uid',
    },
    {
      method: 'GET',
      url: '/api/docs/search',
      max: envInt('RATE_LIMIT_DOCS_SEARCH_MAX', 30),
      key: 'uidOrIp',
    },
    {
      method: 'POST',
      url: '/api/video/download-url',
      max: envInt('RATE_LIMIT_VIDEO_DOWNLOAD_MAX', 5),
      key: 'uid',
    },
    {
      method: 'POST',
      url: '/api/webhooks/whatsapp',
      max: envInt('RATE_LIMIT_WEBHOOK_MAX', 120),
      key: 'ip',
    },
    {
      method: 'POST',
      url: '/api/pbo/review/inbound-email',
      max: envInt('RATE_LIMIT_INBOUND_EMAIL_MAX', 30),
      key: 'ip',
    },
  ];

  for (const route of routeLimits) {
    app.addHook('onRoute', (routeOptions) => {
      if (routeOptions.method !== route.method || routeOptions.url !== route.url) {
        return;
      }
      const existing = routeOptions.config?.rateLimit;
      routeOptions.config = {
        ...routeOptions.config,
        rateLimit: {
          max: route.max,
          timeWindow: envInt('RATE_LIMIT_ROUTE_WINDOW_MS', 60_000),
          keyGenerator: (request) => {
            if (route.key === 'uid' && request.user?.uid) {
              return `uid:${request.user.uid}`;
            }
            if (route.key === 'uidOrIp' && request.user?.uid) {
              return `uid:${request.user.uid}`;
            }
            return request.ip;
          },
          ...(typeof existing === 'object' ? existing : {}),
        },
      };
    });
  }

  app.addHook('onRoute', (routeOptions) => {
    if (routeOptions.url?.startsWith('/api/auth/')) {
      const existing = routeOptions.config?.rateLimit;
      routeOptions.config = {
        ...routeOptions.config,
        rateLimit: {
          max: envInt('RATE_LIMIT_AUTH_MAX', 15),
          timeWindow: envInt('RATE_LIMIT_ROUTE_WINDOW_MS', 60_000),
          keyGenerator: (request) => request.ip,
          ...(typeof existing === 'object' ? existing : {}),
        },
      };
    }
  });
}

/** Webhook paths whose signatures are computed over the exact payload bytes. */
const RAW_BODY_PATHS = new Set([
  '/api/webhooks/whatsapp',
  '/api/pbo/review/inbound-email',
]);

/**
 * Capture raw body for webhook signature verification (WhatsApp, Resend inbound email).
 * @param {import('fastify').FastifyInstance} app
 */
export function registerWhatsappRawBodyHook(app) {
  app.addHook('preParsing', async (request, _reply, payload) => {
    const path = request.url.split('?')[0];
    if (request.method !== 'POST' || !RAW_BODY_PATHS.has(path)) {
      return payload;
    }

    const chunks = [];
    for await (const chunk of payload) {
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks);
    request.rawBody = raw;
    const { Readable } = await import('node:stream');
    return Readable.from([raw]);
  });
}
