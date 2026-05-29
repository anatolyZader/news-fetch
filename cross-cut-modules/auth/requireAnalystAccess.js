import { canViewAnalystDisplay } from './userAccess.js';

/**
 * Fastify helper: 403 unless request may use analyst view.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {boolean} true if allowed
 */
export function requireAnalystView(request, reply) {
  if (!canViewAnalystDisplay(request.user?.email)) {
    reply.code(403).send({
      error: 'Forbidden',
      code: 'analyst_view_required',
      message: 'Analyst access required (listed in config/userAccess.json with level analyst or maintainer).',
    });
    return false;
  }
  return true;
}
