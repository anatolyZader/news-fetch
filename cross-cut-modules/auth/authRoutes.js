/**
 * Auth config and user access API routes.
 */

import { tryAuthPreHandler } from './tryAuthPreHandler.js';
import { ERROR_STATUS } from './requireAuthPreHandler.js';
import { requireDeveloperView } from './requireDeveloperAccess.js';
import { requireMaintainerAccess } from './maintainerAccess.js';
import { listConfiguredUsers, userAccessForApi, canUseRichChatTools } from './userAccess.js';
import { userDistrictAccessForApi } from './userDistrictAccess.js';
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
        const code = request.authTokenError ?? 'forbidden_not_invited';
        const status = ERROR_STATUS[code] ?? 403;
        if (status === 401) {
          return reply.code(401).send({ error: 'Unauthorized', code });
        }
        return reply.code(status).send({
          error: 'Forbidden',
          code,
          message: code === 'email_not_verified'
            ? 'Email address must be verified before using this application.'
            : 'Account is not authorized for this application.',
        });
      }
      return reply.send({
        email: null,
        level: null,
        canViewDeveloper: false,
        canRunAnalysis: false,
        isListed: false,
        districtAccess: userDistrictAccessForApi(null),
      });
    }
    const access = userAccessForApi(request.user?.email ?? null);
    const districtAccess = userDistrictAccessForApi(request.user?.email ?? null);
    return reply.send({
      ...access,
      districtAccess,
    });
  });

  app.get('/api/auth/users', buildAuthHook(true), async (request, reply) => {
    if (!requireDeveloperView(request, reply)) return;
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
      canViewDeveloper: access.canViewDeveloper,
      accessLevel: access.level,
      canRunAnalysis: access.canRunAnalysis,
      // Budget panel is visible to every listed user; activating crisis spend stays developer+.
      showBudgetPanel: canUseRichChatTools(request.user?.email ?? null),
      canControlBudget: access.canViewDeveloper,
      ...getLocaleStatus(),
    });
  });
}
