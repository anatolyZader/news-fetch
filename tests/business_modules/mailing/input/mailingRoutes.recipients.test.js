import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';

import { mailingRoutes } from '../../../../business_modules/mailing/input/mailingRoutes.js';
import { setUserAccessConfigForTests } from '../../../../cross-cut-modules/auth/userAccess.js';

// The gate is the mailingAdmins allowlist, not the access ladder: LISTED_USER below
// is deliberately a listed account that simply is not a mailing admin.
const MAIL_ADMIN = { uid: 'uid-m', email: 'boss@srulik.ai', level: 'developer' };
const LISTED_USER = { uid: 'uid-a', email: 'colleague@example.com', level: 'developer' };

setUserAccessConfigForTests({
  mailingAdmins: ['boss@srulik.ai'],
  users: [
    { email: 'boss@srulik.ai', level: 'developer' },
    { email: 'colleague@example.com', level: 'developer' },
  ],
});

/**
 * In-memory stand-in for the SQLite prefs/recipients store.
 * `selfEmail` seeds the admin's legacy personal destination, which the GET
 * handler is expected to fold onto the shared list.
 */
function fakeStore({ selfEmail = '' } = {}) {
  const prefs = new Map([['uid-m', {
    email: selfEmail,
    language: 'he',
    products: { report: true, naftali: false, education: false, platform: false },
  }]]);
  const recipients = [];
  return {
    prefs,
    recipients,
    getByUid: (uid) => prefs.get(uid) ?? null,
    upsert: ({ userUid, email }) => {
      const row = prefs.get(userUid) ?? { email: '', language: 'en', products: {} };
      if (email !== undefined) row.email = String(email).trim();
      prefs.set(userUid, row);
      return row;
    },
    listDigestSubscribers: () => [],
    listRecipients: () => [...recipients],
    addRecipient: ({ email, addedByUid }) => {
      const normalized = String(email).trim().toLowerCase();
      if (!recipients.some((r) => r.email === normalized)) {
        recipients.push({ email: normalized, addedByUid, active: true, createdAt: '2026-08-08' });
      }
      return recipients.at(-1);
    },
    removeRecipient: (email) => {
      const i = recipients.findIndex((r) => r.email === email);
      if (i === -1) return false;
      recipients.splice(i, 1);
      return true;
    },
  };
}

async function buildApp({ user, store, sent = [], sendImpl }) {
  const app = Fastify();
  await app.register(mailingRoutes, {
    prefsStore: store,
    mailingService: {
      sendDigest: async (args) => {
        sent.push(args);
        if (sendImpl) return sendImpl(args);
        return { id: `msg-${sent.length}` };
      },
    },
    tryAuthPreHandler: async (request) => {
      if (user) request.user = { ...user };
    },
    isMailingConfigured: () => true,
  });
  return app;
}

describe('shared recipient list routes', () => {
  let store;
  let sent;
  beforeEach(() => {
    store = fakeStore();
    sent = [];
  });

  it('lets a mailing admin list, add and remove addresses', async () => {
    const app = await buildApp({ user: MAIL_ADMIN, store, sent });

    let res = await app.inject({ method: 'GET', url: '/api/mail/recipients' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body).recipients, []);

    res = await app.inject({ method: 'POST', url: '/api/mail/recipients', payload: { email: ' Person@Example.COM ' } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body).recipients.map((r) => r.email), ['person@example.com']);

    res = await app.inject({ method: 'DELETE', url: '/api/mail/recipients/person%40example.com' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body).recipients, []);
  });

  it('folds a legacy personal destination onto the list on first read', async () => {
    const legacy = fakeStore({ selfEmail: 'Boss@Srulik.AI' });
    const app = await buildApp({ user: MAIL_ADMIN, store: legacy, sent });

    const res = await app.inject({ method: 'GET', url: '/api/mail/recipients' });
    assert.deepEqual(JSON.parse(res.body).recipients.map((r) => r.email), ['boss@srulik.ai']);
    assert.equal(legacy.prefs.get('uid-m').email, '', 'personal destination is cleared');

    // Idempotent: a second read neither duplicates nor resurrects anything.
    await app.inject({ method: 'GET', url: '/api/mail/recipients' });
    assert.equal(legacy.recipients.length, 1);
    assert.equal(legacy.prefs.get('uid-m').email, '');
  });

  it('does not fold anything for a user without list access', async () => {
    const legacy = fakeStore({ selfEmail: 'boss@srulik.ai' });
    const app = await buildApp({ user: LISTED_USER, store: legacy, sent });

    await app.inject({ method: 'GET', url: '/api/mail/recipients' });
    assert.deepEqual(legacy.recipients, [], 'a 403 must not migrate anything');
    assert.equal(legacy.prefs.get('uid-m').email, 'boss@srulik.ai');
  });

  it('refuses a listed user who is not a mailing admin, on every list route', async () => {
    const app = await buildApp({ user: LISTED_USER, store, sent });

    for (const [method, url] of [
      ['GET', '/api/mail/recipients'],
      ['POST', '/api/mail/recipients'],
      ['DELETE', '/api/mail/recipients/x%40y.com'],
    ]) {
      const res = await app.inject({ method, url, payload: { email: 'x@y.com' } });
      assert.equal(res.statusCode, 403, `${method} ${url} must be forbidden`);
    }
    assert.equal(store.recipients.length, 0);
  });

  it('rejects an invalid address and a missing one', async () => {
    const app = await buildApp({ user: MAIL_ADMIN, store, sent });

    let res = await app.inject({ method: 'POST', url: '/api/mail/recipients', payload: { email: 'nope' } });
    assert.equal(res.statusCode, 400);

    res = await app.inject({ method: 'DELETE', url: '/api/mail/recipients/absent%40example.com' });
    assert.equal(res.statusCode, 404);
  });

  it('reports canManageRecipients on the config endpoint', async () => {
    const asMailAdmin = await buildApp({ user: MAIL_ADMIN, store, sent });
    let res = await asMailAdmin.inject({ method: 'GET', url: '/api/mail/config' });
    assert.deepEqual(JSON.parse(res.body), { enabled: true, canManageRecipients: true });

    const asOtherUser = await buildApp({ user: LISTED_USER, store, sent });
    res = await asOtherUser.inject({ method: 'GET', url: '/api/mail/config' });
    assert.equal(JSON.parse(res.body).canManageRecipients, false);

    // Still reachable without a session, as the client reads it before sign-in.
    const anonymous = await buildApp({ user: null, store, sent });
    res = await anonymous.inject({ method: 'GET', url: '/api/mail/config' });
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).canManageRecipients, false);
  });
});

describe('send-digest fan-out', () => {
  let store;
  let sent;
  beforeEach(() => {
    store = fakeStore();
    sent = [];
  });

  it('sends to exactly the shared list, with no synthesized self copy', async () => {
    store.addRecipient({ email: 'one@example.com', addedByUid: 'uid-m' });
    store.addRecipient({ email: 'two@example.com', addedByUid: 'uid-m' });
    const app = await buildApp({ user: MAIL_ADMIN, store, sent });

    const res = await app.inject({ method: 'POST', url: '/api/mail/send-digest', payload: {} });
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).sent, 2);
    assert.deepEqual(sent.map((s) => s.to).sort(), ['one@example.com', 'two@example.com']);
    // Shared-list addresses inherit the adding admin's language.
    assert.equal(sent[0].language, 'he');
  });

  it('sends to the admin exactly once when their address is on the list', async () => {
    store.addRecipient({ email: 'boss@srulik.ai', addedByUid: 'uid-m' });
    const app = await buildApp({ user: MAIL_ADMIN, store, sent });

    const res = await app.inject({ method: 'POST', url: '/api/mail/send-digest', payload: {} });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(sent.map((s) => s.to), ['boss@srulik.ai']);
  });

  it('falls back to the caller when the list is empty', async () => {
    const app = await buildApp({ user: MAIL_ADMIN, store, sent });

    const res = await app.inject({ method: 'POST', url: '/api/mail/send-digest', payload: {} });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(sent.map((s) => s.to), ['boss@srulik.ai']);
  });

  it('sends only to the named address when `to` is given', async () => {
    store.addRecipient({ email: 'one@example.com', addedByUid: 'uid-m' });
    const app = await buildApp({ user: MAIL_ADMIN, store, sent });

    const res = await app.inject({
      method: 'POST',
      url: '/api/mail/send-digest',
      payload: { to: 'boss@srulik.ai' },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(sent.map((s) => s.to), ['boss@srulik.ai']);
  });

  it('does not fan out for a user who is not a mailing admin', async () => {
    store.prefs.set('uid-a', { email: 'colleague@example.com', language: 'en', products: { report: true } });
    store.addRecipient({ email: 'one@example.com', addedByUid: 'uid-m' });
    const app = await buildApp({ user: LISTED_USER, store, sent });

    const res = await app.inject({ method: 'POST', url: '/api/mail/send-digest', payload: {} });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(sent.map((s) => s.to), ['colleague@example.com']);
  });

  it('reports partial failure without failing the whole send', async () => {
    store.addRecipient({ email: 'ok@example.com', addedByUid: 'uid-m' });
    store.addRecipient({ email: 'broken@example.com', addedByUid: 'uid-m' });
    const app = await buildApp({
      user: MAIL_ADMIN,
      store,
      sent,
      sendImpl: (args) => {
        if (args.to === 'broken@example.com') throw new Error('mailbox full');
        return { id: 'ok' };
      },
    });

    const res = await app.inject({ method: 'POST', url: '/api/mail/send-digest', payload: {} });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.sent, 1);
    assert.equal(body.total, 2);
    assert.deepEqual(body.failures, [{ email: 'broken@example.com', error: 'mailbox full' }]);
  });

  it('fails the request when every send fails', async () => {
    const app = await buildApp({
      user: MAIL_ADMIN,
      store,
      sent,
      sendImpl: () => {
        throw new Error('provider down');
      },
    });

    const res = await app.inject({ method: 'POST', url: '/api/mail/send-digest', payload: {} });
    assert.equal(res.statusCode, 502);
    assert.equal(JSON.parse(res.body).error, 'provider down');
  });
});
