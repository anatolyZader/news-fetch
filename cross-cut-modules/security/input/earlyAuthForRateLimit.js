import { getDefaultAuthPort } from '../../auth/infrastructure/firebaseAuthAdapter.js';
import { attachRequestUser } from '../../auth/attachRequestUser.js';

/**
 * Soft JWT parse on onRequest so @fastify/rate-limit can key by uid before route preHandler.
 * Invalid/missing/unlisted tokens are ignored; requireAuthPreHandler still enforces on protected routes.
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
    const result = await getDefaultAuthPort().verifyToken(authHeader);
    if (!result.decoded) {
      return;
    }
    const attached = attachRequestUser(request, result.decoded, { requireListed: true });
    if (attached.ok) {
      request.authVerified = true;
    }
  });
}
