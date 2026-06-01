import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isEmailVerificationSatisfied } from '../../../cross-cut-modules/auth/firebaseAdmin.js';

describe('firebaseAdmin helpers', () => {
  it('requires verified email for password provider', () => {
    assert.equal(
      isEmailVerificationSatisfied({
        email_verified: false,
        firebase: { sign_in_provider: 'password' },
      }),
      false,
    );
    assert.equal(
      isEmailVerificationSatisfied({
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      }),
      true,
    );
  });

  it('does not require verification for Google sign-in', () => {
    assert.equal(
      isEmailVerificationSatisfied({
        email_verified: false,
        firebase: { sign_in_provider: 'google.com' },
      }),
      true,
    );
  });
});
