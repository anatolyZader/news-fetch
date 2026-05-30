import { verifyIdTokenFromAuthorizationHeader } from '../../auth/firebaseAdmin.js';

/**
 * Soft JWT parse on onRequest so @fastify/rate-limit can key by uid before route preHandler.
 * Invalid/missing tokens are ignored; requireAuthPreHandler still enforces on protected routes.
 * @param {import('fastify').FastifyInstance} app
 * @param {{ authRequired?: boolean }} [opts]
 */
export function registerEarlyAuthForRateLimit(app, opts = {}) {
  if (!opts.authRequired) {
    return;
  }

  app.addHook('onRequest', async (request) => {
    if (request.user?.uid) {
      return;
    }
    const authHeader = request.headers.authorization;
    if (!authHeader || typeof authHeader !== 'string') {
      return;
    }
    const result = await verifyIdTokenFromAuthorizationHeader(authHeader);
    if (!result.decoded) {
      return;
    }
    request.user = {
      uid: result.decoded.uid,
      email: result.decoded.email ?? null,
    };
  });
}
