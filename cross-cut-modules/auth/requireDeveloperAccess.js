import { canViewDeveloperDisplay } from './userAccess.js';

/**
 * Fastify helper: 403 unless request may use developer view.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {boolean} true if allowed
 */
export function requireDeveloperView(request, reply) {
  if (!canViewDeveloperDisplay(request.user?.email)) {
    reply.code(403).send({
      error: 'Forbidden',
      code: 'developer_view_required',
      message: 'Developer access required (listed in config/userAccess.json with level developer or maintainer).',
    });
    return false;
  }
  return true;
}
