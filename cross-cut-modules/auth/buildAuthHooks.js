import { requireAuthPreHandler } from './requireAuthPreHandler.js';
import { tryAuthPreHandler } from './tryAuthPreHandler.js';
import {
  appCheckPreHandler,
  reportTodayAppCheckSoftPreHandler,
} from '../security/input/appCheckPreHandler.js';

/**
 * Protected API routes: JWT (+ listed user) and optionally App Check when enforced.
 * @param {boolean} authRequired
 * @param {{ requireAppCheck?: boolean | 'soft' }} [opts]
 *   - `true` (default): hard App Check when APP_CHECK_ENFORCE=true
 *   - `false`: JWT only
 *   - `'soft'`: verify App Check when header present; allow when absent
 * @returns {{ preHandler?: import('fastify').preHandlerHookHandler[] }}
 */
export function buildAuthHook(authRequired, opts = {}) {
  const { requireAppCheck = true } = opts;
  if (!authRequired) return {};
  const chain = [requireAuthPreHandler];
  if (requireAppCheck === 'soft' && process.env.APP_CHECK_ENFORCE === 'true') {
    chain.push(reportTodayAppCheckSoftPreHandler);
  } else if (requireAppCheck !== false && process.env.APP_CHECK_ENFORCE === 'true') {
    chain.push(appCheckPreHandler);
  }
  return { preHandler: chain };
}

/** JWT + soft App Check — bootstrap reads (GET /api/report/today). */
export function buildReadAuthHook(authRequired) {
  return buildAuthHook(authRequired, { requireAppCheck: 'soft' });
}

/** @deprecated Use {@link buildReadAuthHook} — kept as alias. */
export function buildJwtAuthHook(authRequired) {
  return buildReadAuthHook(authRequired);
}

/**
 * Optional auth for docs/bootstrap: valid token attaches user only if listed (when policy requires).
 * @param {boolean} authRequired
 */
export function buildTryAuthHook(authRequired) {
  if (!authRequired) return {};
  return { preHandler: tryAuthPreHandler };
}

/**
 * Single preHandler for routes that register auth manually (legacy `authPreHandler` opt).
 * @param {boolean} authRequired
 * @returns {import('fastify').preHandlerHookHandler | undefined}
 */
export function getAuthPreHandler(authRequired) {
  if (!authRequired) return undefined;
  return async (request, reply) => {
    await requireAuthPreHandler(request, reply);
  };
}

/**
 * @param {{ preHandler?: import('fastify').preHandlerHookHandler | import('fastify').preHandlerHookHandler[] }} authHook
 * @returns {import('fastify').preHandlerHookHandler[]}
 */
export function authPreHandlerList(authHook = {}) {
  const p = authHook.preHandler;
  if (!p) return [];
  return Array.isArray(p) ? p : [p];
}

/**
 * @param {import('fastify').preHandlerHookHandler | import('fastify').preHandlerHookHandler[] | undefined} authPreHandler
 * @returns {import('fastify').preHandlerHookHandler[]}
 */
export function normalizeAuthPreHandlers(authPreHandler) {
  if (!authPreHandler) return [];
  return Array.isArray(authPreHandler) ? authPreHandler : [authPreHandler];
}

/**
 * Full protected chain for Fastify `preHandler` opts (auth + App Check when enforced).
 * @param {boolean} authRequired
 */
export function getProtectedAuthPreHandlers(authRequired) {
  if (!authRequired) return undefined;
  const list = authPreHandlerList(buildAuthHook(true));
  return list.length ? list : undefined;
}
