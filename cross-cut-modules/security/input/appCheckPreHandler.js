import admin from 'firebase-admin';

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
 * @param {import('fastify').preHandlerHookHandler[]} hooks
 */
export function withAppCheck(hooks = []) {
  if (process.env.APP_CHECK_ENFORCE !== 'true') {
    return hooks.length ? { preHandler: hooks } : {};
  }
  return { preHandler: [appCheckPreHandler, ...hooks] };
}
