import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildRequestUserFromDecoded } from '../../../cross-cut-modules/auth/attachRequestUser.js';
import {
  resetUserAccessCache,
  setUserAccessConfigForTests,
} from '../../../cross-cut-modules/auth/userAccess.js';

describe('attachRequestUser', () => {
  beforeEach(() => {
    resetUserAccessCache();
    process.env.AUTH_REQUIRE_LISTED_USER = 'true';
  });

  afterEach(() => {
    resetUserAccessCache();
    delete process.env.AUTH_REQUIRE_LISTED_USER;
  });

  it('rejects unlisted users when membership required', () => {
    setUserAccessConfigForTests({ operatorDistrictEnforcementEnabled: false, users: [] });
    const out = buildRequestUserFromDecoded({
      uid: 'u1',
      email: 'stranger@test.io',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    });
    assert.equal(out.error, 'forbidden_not_invited');
  });

  it('attaches level for listed users', () => {
    setUserAccessConfigForTests({
      operatorDistrictEnforcementEnabled: false,
      users: [{ email: 'ops@test.io', level: 'operator' }],
    });
    const out = buildRequestUserFromDecoded({
      uid: 'u2',
      email: 'ops@test.io',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    });
    assert.equal(out.user?.level, 'operator');
    assert.equal(out.user?.uid, 'u2');
  });
});
