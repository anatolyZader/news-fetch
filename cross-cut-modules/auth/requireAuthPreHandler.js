import { getDefaultAuthPort } from './infrastructure/firebaseAuthAdapter.js';
import { attachRequestUser } from './attachRequestUser.js';
import { auditFromRequest } from '../security/input/auditLog.js';

const ERROR_STATUS = {
  missing_token: 401,
  invalid_token: 401,
  token_revoked: 401,
  email_not_verified: 403,
  forbidden_not_invited: 403,
};

/**
 * Fastify preHandler: require valid Firebase ID token, verified email (password), and listed user.
 */
export async function requireAuthPreHandler(request, reply) {
  const result = await getDefaultAuthPort().verifyToken(request.headers.authorization);
  if (!result.decoded) {
    const code = result.error ?? 'invalid_token';
    return reply.code(ERROR_STATUS[code] ?? 401).send({ error: 'Unauthorized', code });
  }

  const attached = attachRequestUser(request, result.decoded, { requireListed: true });
  if (!attached.ok) {
    auditFromRequest(request, 'auth.denied_not_invited', request.url, { code: attached.error });
    return reply.code(attached.statusCode ?? 403).send({
      error: 'Forbidden',
      code: attached.error ?? 'forbidden_not_invited',
      message: 'Account is not authorized for this application. Contact an administrator.',
    });
  }
}
