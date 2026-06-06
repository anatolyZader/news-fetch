import admin from 'firebase-admin';

const SOFT_METRIC = 'security.app_check.soft';

/** @type {import('../../monitoring/domain/ports/IMetricsPort.js').noopMetricsPort | null} */
let softMetricsPort = null;

/** Wire shared in-process metrics (composition root). */
export function setAppCheckSoftMetricsPort(port) {
  softMetricsPort = port;
}

/**
 * @param {'missing'|'verified'|'invalid'} outcome
 * @param {string} [route]
 */
function recordSoftAppCheckOutcome(outcome, route = 'unknown') {
  softMetricsPort?.increment(SOFT_METRIC, 1, { outcome, route });
}

/**
 * When APP_CHECK_ENFORCE=true, require valid Firebase App Check token.
 * Header: X-Firebase-AppCheck
 */
export async function appCheckPreHandler(request, reply) {
  if (process.env.APP_CHECK_ENFORCE !== 'true') {
    return;
  }

  const token = request.headers['x-firebase-appcheck'];
  if (!token || typeof token !== 'string' || !token.trim()) {
    return reply.code(401).send({
      error: 'Unauthorized',
      code: 'missing_app_check',
    });
  }

  try {
    await admin.appCheck().verifyToken(token.trim());
  } catch {
    return reply.code(401).send({
      error: 'Unauthorized',
      code: 'invalid_app_check',
    });
  }
}

/**
 * Soft App Check: verify token when the client sends one; allow JWT-only when absent.
 * Rejects forged / expired tokens (same as hard mode when header is present).
 *
 * Sets `request.appCheckStatus` to `missing` | `verified`.
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @param {{ route?: string }} [opts]
 */
export async function appCheckSoftPreHandler(request, reply, opts = {}) {
  if (process.env.APP_CHECK_ENFORCE !== 'true') {
    return;
  }

  const route = opts.route ?? 'unknown';
  const token = request.headers['x-firebase-appcheck'];
  if (!token || typeof token !== 'string' || !token.trim()) {
    request.appCheckStatus = 'missing';
    recordSoftAppCheckOutcome('missing', route);
    return;
  }

  try {
    await admin.appCheck().verifyToken(token.trim());
    request.appCheckStatus = 'verified';
    recordSoftAppCheckOutcome('verified', route);
  } catch {
    recordSoftAppCheckOutcome('invalid', route);
    return reply.code(401).send({
      error: 'Unauthorized',
      code: 'invalid_app_check',
    });
  }
}

/**
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 */
export async function reportTodayAppCheckSoftPreHandler(request, reply) {
  return appCheckSoftPreHandler(request, reply, { route: 'report_today' });
}

/**
 * @param {import('fastify').preHandlerHookHandler[]} hooks
 */
export function withAppCheck(hooks = []) {
  if (process.env.APP_CHECK_ENFORCE !== 'true') {
    return hooks.length ? { preHandler: hooks } : {};
  }
  return { preHandler: [appCheckPreHandler, ...hooks] };
}
