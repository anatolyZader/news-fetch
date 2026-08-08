/**
 * Validated environment profiles (development vs production).
 */
import { resolveSqlitePath } from './sqlitePath.js';

const PROFILES = {
  development: {
    authRequired: false,
    trustProxy: false,
    enableSwagger: true,
  },
  production: {
    authRequired: true,
    trustProxy: true,
    enableSwagger: false,
  },
};

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function loadAppConfig(env = process.env) {
  const nodeEnv = (env.NODE_ENV ?? '').trim() || 'development';
  const profile = nodeEnv === 'production' ? PROFILES.production : PROFILES.development;

  const authRequired =
    env.AUTH_REQUIRED === 'true' ||
    (profile.authRequired && !!env.FIREBASE_PROJECT_ID?.trim());

  const trustProxy =
    env.TRUST_PROXY === 'true' || (profile.trustProxy && nodeEnv === 'production');

  const enableSwagger =
    env.ENABLE_SWAGGER === 'true' ||
    (profile.enableSwagger && nodeEnv !== 'production');

  const developerEmails = (env.RESILIENCE_ANALYST_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    nodeEnv,
    authRequired,
    trustProxy,
    enableSwagger,
    sqlitePath: resolveSqlitePath(env),
    timezone: env.TZ_ARTICLES || 'Asia/Jerusalem',
    serveStatic: env.SERVE_STATIC !== 'false',
    otelEnabled: env.OTEL_ENABLED === 'true',
    otelServiceName: env.OTEL_SERVICE_NAME?.trim() || 'news',
    outboxDispatchIntervalMs: Number(env.OUTBOX_DISPATCH_INTERVAL_MS || 5000),
    pipelineRunTracking: env.PIPELINE_RUN_TRACKING !== '0',
    resilienceSecondExtract: env.RESILIENCE_SECOND_EXTRACT === '1',
    developerEmails,
  };
}
