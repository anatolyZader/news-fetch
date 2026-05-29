import { canRunAnalysisDisplay } from './userAccess.js';

/**
 * Fastify helper: 403 unless request user may run analysis.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {boolean} true if allowed
 */
export function requireMaintainerAccess(request, reply) {
  if (!canRunAnalysisDisplay(request.user?.email)) {
    reply.code(403).send({
      error: 'Forbidden',
      code: 'maintainer_required',
      message: 'Running analysis requires a maintainer account (config/userAccess.json level maintainer).',
    });
    return false;
  }
  return true;
}

export { canRunAnalysisDisplay } from './userAccess.js';
