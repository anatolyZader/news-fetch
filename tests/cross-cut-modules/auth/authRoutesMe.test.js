import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { authRoutes } from '../../../cross-cut-modules/auth/authRoutes.js';
import { setDefaultAuthPort } from '../../../cross-cut-modules/auth/infrastructure/firebaseAuthAdapter.js';
import {
  setUserAccessConfigForTests,
  resetUserAccessCache,
} from '../../../cross-cut-modules/auth/userAccess.js';

const LISTED_EMAIL = 'listed@example.com';

function stubPort(byToken) {
  return {
    init: () => {},
    verifyToken: async (authorization) => {
      const token = String(authorization ?? '').replace(/^Bearer /, '');
      return byToken[token] ?? { error: 'invalid_token' };
    },
    isEmailVerified: async () => true,
  };
}

describe('GET /api/auth/me', () => {
  let app;
  const savedRequireListed = process.env.AUTH_REQUIRE_LISTED_USER;

  beforeEach(async () => {
    process.env.AUTH_REQUIRE_LISTED_USER = 'true';
    setUserAccessConfigForTests({
      userDistrictEnforcementEnabled: false,
      users: [{ email: LISTED_EMAIL, level: 'user' }],
    });
    setDefaultAuthPort(stubPort({
      'valid-listed': { decoded: { uid: 'u1', email: LISTED_EMAIL, email_verified: true } },
      'valid-unlisted': { decoded: { uid: 'u2', email: 'stranger@example.com', email_verified: true } },
      'expired': { error: 'invalid_token' },
      'revoked': { error: 'token_revoked' },
    }));
    app = Fastify();
    await authRoutes(app, { authRequired: true });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    setDefaultAuthPort(null);
    resetUserAccessCache();
    if (savedRequireListed === undefined) delete process.env.AUTH_REQUIRE_LISTED_USER;
    else process.env.AUTH_REQUIRE_LISTED_USER = savedRequireListed;
  });

  async function me(token) {
    return app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  it('returns the listed user profile for a valid token', async () => {
    const res = await me('valid-listed');
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().email, LISTED_EMAIL);
    assert.equal(res.json().level, 'user');
  });

  it('returns 401 invalid_token for an expired/invalid token (enables client refresh-retry)', async () => {
    const res = await me('expired');
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.json(), { error: 'Unauthorized', code: 'invalid_token' });
  });

  it('returns 401 token_revoked for a revoked token', async () => {
    const res = await me('revoked');
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().code, 'token_revoked');
  });

  it('returns 403 forbidden_not_invited only for valid-but-unlisted users', async () => {
    const res = await me('valid-unlisted');
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().code, 'forbidden_not_invited');
  });

  it('returns the anonymous payload without a bearer header', async () => {
    const res = await me(null);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().email, null);
    assert.equal(res.json().isListed, false);
  });
});
