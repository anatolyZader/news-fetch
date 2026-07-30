import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { requireAuthPreHandler } from '../../../cross-cut-modules/auth/requireAuthPreHandler.js';
import { setDefaultAuthPort } from '../../../cross-cut-modules/auth/infrastructure/firebaseAuthAdapter.js';

function fakeReply() {
  const reply = {
    statusCode: null,
    payload: null,
    code(status) { this.statusCode = status; return this; },
    send(payload) { this.payload = payload; return this; },
  };
  return reply;
}

describe('requireAuthPreHandler', () => {
  afterEach(() => {
    setDefaultAuthPort(null);
  });

  it('skips re-verification when early auth already attached the user', async () => {
    let verifyCalls = 0;
    setDefaultAuthPort({
      init: () => {},
      verifyToken: async () => { verifyCalls += 1; return { error: 'invalid_token' }; },
      isEmailVerified: async () => true,
    });
    const request = {
      authVerified: true,
      user: { uid: 'u1', email: 'listed@example.com' },
      headers: { authorization: 'Bearer whatever' },
    };
    const reply = fakeReply();
    await requireAuthPreHandler(request, reply);
    assert.equal(verifyCalls, 0);
    assert.equal(reply.statusCode, null);
  });

  it('still verifies when no early-auth marker is present', async () => {
    let verifyCalls = 0;
    setDefaultAuthPort({
      init: () => {},
      verifyToken: async () => { verifyCalls += 1; return { error: 'invalid_token' }; },
      isEmailVerified: async () => true,
    });
    const request = { headers: { authorization: 'Bearer whatever' }, url: '/api/x' };
    const reply = fakeReply();
    await requireAuthPreHandler(request, reply);
    assert.equal(verifyCalls, 1);
    assert.equal(reply.statusCode, 401);
    assert.equal(reply.payload.code, 'invalid_token');
  });
});
