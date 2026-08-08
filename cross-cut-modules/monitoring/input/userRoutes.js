/**
 * User district access API.
 */

import { tryAuthPreHandler } from '../../auth/tryAuthPreHandler.js';
import { userDistrictAccessForApi } from '../../auth/userDistrictAccess.js';

/**
 * @param {import('fastify').FastifyInstance} app
 */
export async function userRoutes(app) {
  app.get('/api/user/district-access', async (request, reply) => {
    await tryAuthPreHandler(request, reply);
    return reply.send(userDistrictAccessForApi(request.user?.email ?? null));
  });
}
