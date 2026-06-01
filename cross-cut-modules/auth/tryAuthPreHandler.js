import { getDefaultAuthPort } from './infrastructure/firebaseAuthAdapter.js';
import { attachRequestUser } from './attachRequestUser.js';

/**
 * Fastify preHandler: best-effort auth. Valid listed user → `request.user`; otherwise unauthenticated.
 */
export async function tryAuthPreHandler(request, _reply) {
  const result = await getDefaultAuthPort().verifyToken(request.headers.authorization);
  if (!result.decoded) return;

  const attached = attachRequestUser(request, result.decoded, { requireListed: true });
  if (!attached.ok) {
    return;
  }
}
