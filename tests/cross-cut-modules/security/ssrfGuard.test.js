import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  validateUserFetchUrl,
  isBlockedHostname,
  assertResolvedHostSafe,
} from '../../../cross-cut-modules/security/domain/services/ssrfGuard.js';
import { safeFetch } from '../../../cross-cut-modules/security/infrastructure/safeFetch.js';
import {
  validateProductionSecurity,
  productionSecurityWarnings,
} from '../../../cross-cut-modules/security/app/validateProductionSecurity.js';
import { verifyWhatsAppWebhookSignature } from '../../../cross-cut-modules/security/infrastructure/whatsappSignature.js';

describe('ssrfGuard', () => {
  it('blocks localhost and metadata IP', () => {
    assert.throws(() => validateUserFetchUrl('http://localhost/secret'), /not allowed/);
    assert.throws(() => validateUserFetchUrl('http://169.254.169.254/latest/meta-data'), /not allowed/);
    assert.throws(() => validateUserFetchUrl('http://192.168.0.1/internal'), /not allowed/);
  });

  it('allows public https URLs', () => {
    const u = validateUserFetchUrl('https://example.com/article');
    assert.equal(u, 'https://example.com/article');
  });

  it('blocks credentials in URL', () => {
    assert.throws(() => validateUserFetchUrl('https://user:pass@example.com/x'), /credentials/);
  });

  it('isBlockedHostname covers link-local IPv6', () => {
    assert.equal(isBlockedHostname('fe80::1'), true);
  });
});

describe('assertResolvedHostSafe', () => {
  it('rejects unresolvable hostname', async () => {
    await assert.rejects(
      () => assertResolvedHostSafe('this-host-should-not-exist-xyz123.invalid'),
      /could not be resolved|not allowed/,
    );
  });
});

describe('safeFetch redirects', () => {
  it('rejects redirect to internal host', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, _init) => {
      if (url === 'https://example.com/start') {
        return new Response(null, {
          status: 302,
          headers: { location: 'http://127.0.0.1/internal' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    try {
      await assert.rejects(() => safeFetch('https://example.com/start'), /not allowed/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('validateProductionSecurity', () => {
  const validProdEnv = {
    NODE_ENV: 'production',
    AUTH_REQUIRED: 'true',
    FIREBASE_PROJECT_ID: 'proj',
    APP_CHECK_ENFORCE: 'true',
    TRUST_PROXY: 'true',
    ENABLE_HSTS: 'true',
    SECURITY_CONTACT_EMAIL: 'security@example.org',
    RESILIENCE_PROBE_HMAC_SECRET: 'secret',
  };

  it('requires auth and firebase in production', () => {
    assert.throws(
      () =>
        validateProductionSecurity({
          ...validProdEnv,
          AUTH_REQUIRED: 'false',
        }),
      /AUTH_REQUIRED/,
    );
  });

  it('passes when production env is configured', () => {
    assert.doesNotThrow(() => validateProductionSecurity(validProdEnv));
  });

  it('requires APP_CHECK_ENFORCE in production', () => {
    assert.throws(
      () =>
        validateProductionSecurity({
          ...validProdEnv,
          APP_CHECK_ENFORCE: 'false',
        }),
      /APP_CHECK_ENFORCE/,
    );
  });

  it('requires WHATSAPP_APP_SECRET when verify token set', () => {
    assert.throws(
      () =>
        validateProductionSecurity({
          ...validProdEnv,
          WHATSAPP_VERIFY_TOKEN: 'tok',
        }),
      /WHATSAPP_APP_SECRET/,
    );
  });

  it('rejects ENABLE_SWAGGER in production', () => {
    assert.throws(
      () =>
        validateProductionSecurity({
          ...validProdEnv,
          ENABLE_SWAGGER: 'true',
        }),
      /ENABLE_SWAGGER/,
    );
  });

  it('requires TRUST_PROXY and ENABLE_HSTS in production', () => {
    assert.throws(
      () => validateProductionSecurity({ ...validProdEnv, TRUST_PROXY: 'false' }),
      /TRUST_PROXY/,
    );
    assert.throws(
      () => validateProductionSecurity({ ...validProdEnv, ENABLE_HSTS: 'false' }),
      /ENABLE_HSTS/,
    );
  });

  it('requires SECURITY_CONTACT_EMAIL in production', () => {
    assert.throws(
      () => validateProductionSecurity({ ...validProdEnv, SECURITY_CONTACT_EMAIL: '' }),
      /SECURITY_CONTACT_EMAIL/,
    );
    assert.throws(
      () => validateProductionSecurity({ ...validProdEnv, SECURITY_CONTACT_EMAIL: 'not-an-email' }),
      /valid email/,
    );
  });

  it('returns no production warnings', () => {
    assert.deepEqual(productionSecurityWarnings({ NODE_ENV: 'production', ENABLE_SWAGGER: 'true' }), []);
  });
});

describe('verifyWhatsAppWebhookSignature', () => {
  it('accepts valid HMAC', () => {
    const secret = 'test-secret';
    const body = '{"entry":[]}';
    const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    const result = verifyWhatsAppWebhookSignature(body, sig, secret);
    assert.equal(result.ok, true);
  });

  it('rejects invalid signature', () => {
    const result = verifyWhatsAppWebhookSignature('{}', 'sha256=deadbeef', 'secret');
    assert.equal(result.ok, false);
  });
});
