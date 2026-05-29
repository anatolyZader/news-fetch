/**
 * Operator district access API.
 */

import { tryAuthPreHandler } from '../../cross-cut-modules/auth/tryAuthPreHandler.js';
import { operatorDistrictAccessForApi } from '../../cross-cut-modules/auth/operatorDistrictAccess.js';

/**
 * @param {import('fastify').FastifyInstance} app
 */
export async function operatorRoutes(app) {
  app.get('/api/operator/district-access', async (request, reply) => {
    await tryAuthPreHandler(request, reply);
    return reply.send(operatorDistrictAccessForApi(request.user?.email ?? null));
  });
}
