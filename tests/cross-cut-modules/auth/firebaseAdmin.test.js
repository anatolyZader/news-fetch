import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isEmailVerificationSatisfied } from '../../../cross-cut-modules/auth/firebaseAdmin.js';

describe('firebaseAdmin helpers', () => {
  it('requires verified email for password provider', () => {
    assert.equal(
      isEmailVerificationSatisfied({
        email: 'user@example.com',
        email_verified: false,
        firebase: { sign_in_provider: 'password' },
      }),
      false,
    );
    assert.equal(
      isEmailVerificationSatisfied({
        email: 'user@example.com',
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      }),
      true,
    );
  });

  it('requires verified email for federated providers too', () => {
    assert.equal(
      isEmailVerificationSatisfied({
        email: 'user@example.com',
        email_verified: false,
        firebase: { sign_in_provider: 'google.com' },
      }),
      false,
    );
    assert.equal(
      isEmailVerificationSatisfied({
        email: 'user@example.com',
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      }),
      true,
    );
  });

  it('passes tokens without an email claim (listed-user check rejects them later)', () => {
    assert.equal(
      isEmailVerificationSatisfied({
        firebase: { sign_in_provider: 'custom' },
      }),
      true,
    );
  });
});
