/**
 * Auth config and user access API routes.
 */

import { tryAuthPreHandler } from './tryAuthPreHandler.js';
import { requireAnalystView } from './requireAnalystAccess.js';
import { requireMaintainerAccess } from './maintainerAccess.js';
import { listConfiguredUsers, userAccessForApi } from './userAccess.js';
import { operatorDistrictAccessForApi } from './operatorDistrictAccess.js';
import { auditFromRequest } from '../security/input/auditLog.js';
import {
  isAuthRequireListedUser,
  isSignupDisabled,
} from './authPolicy.js';
import { syncAllUserAccessClaims } from './userAccessClaims.js';
import { buildAuthHook } from './buildAuthHooks.js';
import { getLocaleStatus } from '../../business_modules/translation/index.js';

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ authRequired?: boolean }} opts
 */
export async function authRoutes(app, opts = {}) {
  const { authRequired = false } = opts;
  const appCheckEnforced = process.env.APP_CHECK_ENFORCE === 'true';
  const maintainerAuth = buildAuthHook(true);

  app.get('/api/auth/config', async (_req, reply) => {
    return reply.send({
      authRequired,
      appCheckEnforced,
      requireListedUser: isAuthRequireListedUser(),
      disableSignup: isSignupDisabled(),
    });
  });

  app.get('/api/auth/me', async (request, reply) => {
    await tryAuthPreHandler(request, reply);
    if (!request.user) {
      const hasBearer = Boolean(request.headers.authorization?.startsWith?.('Bearer '));
      if (authRequired && hasBearer) {
        return reply.code(403).send({
          error: 'Forbidden',
          code: 'forbidden_not_invited',
          message: 'Account is not authorized for this application.',
        });
      }
      return reply.send({
        email: null,
        level: null,
        canViewAnalyst: false,
        canRunAnalysis: false,
        isListed: false,
        districtAccess: operatorDistrictAccessForApi(null),
      });
    }
    const access = userAccessForApi(request.user?.email ?? null);
    const districtAccess = operatorDistrictAccessForApi(request.user?.email ?? null);
    return reply.send({
      ...access,
      districtAccess,
    });
  });

  app.get('/api/auth/users', buildAuthHook(true), async (request, reply) => {
    if (!requireAnalystView(request, reply)) return;
    auditFromRequest(request, 'auth.users.list', '/api/auth/users');
    return reply.send({
      users: listConfiguredUsers().map((u) => ({
        email: u.email,
        level: u.level,
        ...(u.districtIds ? { districtIds: u.districtIds } : {}),
        ...(u.allDistricts ? { allDistricts: true } : {}),
      })),
    });
  });

  app.post('/api/auth/sync-claims', maintainerAuth, async (request, reply) => {
    if (!requireMaintainerAccess(request, reply)) return;
    auditFromRequest(request, 'auth.sync_claims', '/api/auth/sync-claims');
    const results = await syncAllUserAccessClaims();
    return reply.send({ synced: results.filter((r) => r.ok).length, results });
  });

  app.get('/api/resilience/display-capabilities', async (request, reply) => {
    await tryAuthPreHandler(request, reply);
    const access = userAccessForApi(request.user?.email ?? null);
    return reply.send({
      canViewAnalyst: access.canViewAnalyst,
      accessLevel: access.level,
      canRunAnalysis: access.canRunAnalysis,
      ...getLocaleStatus(),
    });
  });
}
