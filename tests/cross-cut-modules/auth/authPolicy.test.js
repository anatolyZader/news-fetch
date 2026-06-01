import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAuthRequireListedUser,
  isSignupDisabled,
  shouldCheckRevokedTokens,
} from '../../../cross-cut-modules/auth/authPolicy.js';

describe('authPolicy', () => {
  afterEach(() => {
    delete process.env.AUTH_REQUIRE_LISTED_USER;
    delete process.env.AUTH_REQUIRED;
    delete process.env.NODE_ENV;
    delete process.env.AUTH_DISABLE_SIGNUP;
    delete process.env.FIREBASE_CHECK_REVOKED;
  });

  it('requires listed users in production by default', () => {
    assert.equal(isAuthRequireListedUser({ NODE_ENV: 'production' }), true);
  });

  it('honors AUTH_REQUIRE_LISTED_USER=false', () => {
    assert.equal(
      isAuthRequireListedUser({ NODE_ENV: 'production', AUTH_REQUIRE_LISTED_USER: 'false' }),
      false,
    );
  });

  it('disables signup in production by default', () => {
    assert.equal(isSignupDisabled({ NODE_ENV: 'production' }), true);
  });

  it('checks revoked tokens in production by default', () => {
    assert.equal(shouldCheckRevokedTokens({ NODE_ENV: 'production' }), true);
  });
});
