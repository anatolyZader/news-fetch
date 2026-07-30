import { getDefaultAuthPort } from './infrastructure/firebaseAuthAdapter.js';
import { attachRequestUser } from './attachRequestUser.js';

/**
 * Fastify preHandler: best-effort auth. Valid listed user → `request.user`; otherwise
 * unauthenticated, with the failure code recorded on `request.authTokenError`.
 */
export async function tryAuthPreHandler(request, _reply) {
  const result = await getDefaultAuthPort().verifyToken(request.headers.authorization);
  if (!result.decoded) {
    request.authTokenError = result.error ?? 'invalid_token';
    return;
  }

  const attached = attachRequestUser(request, result.decoded, { requireListed: true });
  if (!attached.ok) {
    request.authTokenError = attached.error ?? 'forbidden_not_invited';
  }
}
