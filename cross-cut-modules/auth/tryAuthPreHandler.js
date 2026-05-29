import { verifyIdTokenFromAuthorizationHeader } from './firebaseAdmin.js';

/**
 * Fastify preHandler: best-effort auth. If a valid Firebase ID token is present,
 * attach `request.user`; otherwise proceed unauthenticated.
 */
export async function tryAuthPreHandler(request, _reply) {
  const result = await verifyIdTokenFromAuthorizationHeader(request.headers.authorization);
  if (!result.decoded) return;
  request.user = {
    uid: result.decoded.uid,
    email: result.decoded.email ?? null,
  };
}
