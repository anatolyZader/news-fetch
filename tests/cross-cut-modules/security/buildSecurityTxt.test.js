import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSecurityTxt } from '../../../cross-cut-modules/security/app/buildSecurityTxt.js';
import { resolveListenHost } from '../../../cross-cut-modules/security/app/resolveListenHost.js';

describe('buildSecurityTxt', () => {
  it('builds RFC 9116 body from env', () => {
    const txt = buildSecurityTxt({
      SECURITY_CONTACT_EMAIL: 'security@example.org',
      SECURITY_POLICY_URL: 'https://example.org/policy',
      SECURITY_TXT_EXPIRES: '2027-01-01T00:00:00.000Z',
    });
    assert.match(txt, /Contact: mailto:security@example\.org/);
    assert.match(txt, /Policy: https:\/\/example\.org\/policy/);
    assert.match(txt, /Expires: 2027-01-01T00:00:00.000Z/);
  });
});

describe('resolveListenHost', () => {
  it('defaults to localhost in production', () => {
    assert.equal(resolveListenHost({ NODE_ENV: 'production' }), '127.0.0.1');
  });

  it('respects explicit HOST', () => {
    assert.equal(resolveListenHost({ NODE_ENV: 'production', HOST: '0.0.0.0' }), '0.0.0.0');
  });

  it('allows public bind when ALLOW_PUBLIC_BIND=true', () => {
    assert.equal(
      resolveListenHost({ NODE_ENV: 'production', ALLOW_PUBLIC_BIND: 'true' }),
      '0.0.0.0',
    );
  });
});
