import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  buildContentSecurityPolicyDirectives,
} from '../../../cross-cut-modules/security/app/buildContentSecurityPolicy.js';

describe('buildContentSecurityPolicyDirectives', () => {
  it('includes Firebase Auth connect targets when ENABLE_STRICT_CSP is true', () => {
    const directives = buildContentSecurityPolicyDirectives({
      ENABLE_STRICT_CSP: 'true',
      AUTH_REQUIRED: 'true',
      APP_CHECK_ENFORCE: 'true',
      FIREBASE_PROJECT_ID: 'demo-project',
    });

    assert.ok(directives.connectSrc.includes("'self'"));
    assert.ok(directives.connectSrc.includes('https://securetoken.googleapis.com'));
    assert.ok(directives.connectSrc.includes('https://identitytoolkit.googleapis.com'));
    assert.ok(directives.connectSrc.includes('https://firebaseappcheck.googleapis.com'));
    assert.ok(!directives.connectSrc.includes('https:'));
  });

  it('allows broad https connect-src outside strict mode', () => {
    const directives = buildContentSecurityPolicyDirectives({
      ENABLE_STRICT_CSP: 'false',
      AUTH_REQUIRED: 'true',
      APP_CHECK_ENFORCE: 'true',
      FIREBASE_PROJECT_ID: 'demo-project',
    });

    assert.ok(directives.connectSrc.includes('https:'));
  });

  it('includes Google script and frame sources for auth and App Check', () => {
    const directives = buildContentSecurityPolicyDirectives({
      ENABLE_STRICT_CSP: 'true',
      AUTH_REQUIRED: 'true',
      APP_CHECK_ENFORCE: 'true',
      FIREBASE_PROJECT_ID: 'demo-project',
    });

    assert.ok(directives.scriptSrc.includes("'unsafe-inline'"));
    assert.ok(directives.scriptSrc.includes('https://apis.google.com'));
    assert.ok(directives.scriptSrc.includes('https://www.google.com'));
    assert.ok(directives.frameSrc.includes('https://accounts.google.com'));
    assert.ok(directives.frameSrc.includes('https://recaptcha.google.com'));
  });
});
