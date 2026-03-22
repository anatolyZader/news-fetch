import { verifyIdTokenFromAuthorizationHeader } from './firebaseAdmin.js';

/**
 * Fastify preHandler: require valid Firebase Auth ID token (Bearer JWT).
 */
export async function requireAuthPreHandler(request, reply) {
  const result = await verifyIdTokenFromAuthorizationHeader(request.headers.authorization);
  if (!result.decoded) {
    return reply.code(401).send({ error: 'Unauthorized', code: result.error });
  }
  request.user = {
    uid: result.decoded.uid,
    email: result.decoded.email ?? null,
  };
}
