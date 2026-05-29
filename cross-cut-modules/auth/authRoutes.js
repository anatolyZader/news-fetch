/**
 * Auth config and user access API routes.
 */

import { tryAuthPreHandler } from './tryAuthPreHandler.js';
import { listConfiguredUsers, userAccessForApi } from './userAccess.js';
import { operatorDistrictAccessForApi } from './operatorDistrictAccess.js';

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ authRequired?: boolean }} opts
 */
export async function authRoutes(app, opts = {}) {
  const { authRequired = false } = opts;

  app.get('/api/auth/config', async (_req, reply) => {
    return reply.send({ authRequired });
  });

  app.get('/api/auth/me', async (request, reply) => {
    await tryAuthPreHandler(request, reply);
    const access = userAccessForApi(request.user?.email ?? null);
    const districtAccess = operatorDistrictAccessForApi(request.user?.email ?? null);
    return reply.send({
      ...access,
      districtAccess,
    });
  });

  app.get('/api/auth/users', async (_request, reply) => {
    return reply.send({
      users: listConfiguredUsers().map((u) => ({
        email: u.email,
        level: u.level,
        ...(u.districtIds ? { districtIds: u.districtIds } : {}),
        ...(u.allDistricts ? { allDistricts: true } : {}),
      })),
    });
  });

  app.get('/api/resilience/display-capabilities', async (request, reply) => {
    await tryAuthPreHandler(request, reply);
    const access = userAccessForApi(request.user?.email ?? null);
    return reply.send({
      canViewAnalyst: access.canViewAnalyst,
      accessLevel: access.level,
      canRunAnalysis: access.canRunAnalysis,
    });
  });
}
