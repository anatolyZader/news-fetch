import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createMailingPreferencesStore } from '../../../../business_modules/mailing/infrastructure/mailingPreferencesStore.js';

test('mailingPreferencesStore upsert and listDigestSubscribers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mail-prefs-'));
  try {
    const dbPath = join(dir, 'test.sqlite');
    const store = createMailingPreferencesStore(dbPath);
    assert.equal(store.getByUid('u1'), null);

    store.upsert({
      userUid: 'u1',
      email: 'a@example.com',
      language: 'he',
      products: { report: true, naftali: false, education: false, platform: false },
    });

    const row = store.getByUid('u1');
    assert.equal(row.email, 'a@example.com');
    assert.equal(row.language, 'he');
    assert.equal(row.products.report, true);
    assert.equal(row.products.naftali, false);

    const subs = store.listDigestSubscribers();
    assert.equal(subs.length, 1);
    assert.equal(subs[0].userUid, 'u1');
    assert.equal(subs[0].language, 'he');

    store.upsert({
      userUid: 'u1',
      email: '',
      products: { report: true },
    });
    assert.equal(store.listDigestSubscribers().length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mailingPreferencesStore shared recipient list', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mail-recipients-'));
  try {
    const store = createMailingPreferencesStore(join(dir, 'test.sqlite'));
    assert.deepEqual(store.listRecipients(), []);

    store.addRecipient({ email: '  Colleague@Example.COM ', addedByUid: 'uid-m' });
    const [first] = store.listRecipients();
    assert.equal(first.email, 'colleague@example.com', 'address is normalized on write');
    assert.equal(first.addedByUid, 'uid-m');
    assert.equal(first.active, true);

    // Re-adding the same address must not duplicate it, and re-stamps the owner.
    store.addRecipient({ email: 'colleague@example.com', addedByUid: 'uid-other' });
    assert.equal(store.listRecipients().length, 1);
    assert.equal(store.listRecipients()[0].addedByUid, 'uid-other');

    store.addRecipient({ email: 'second@example.com', addedByUid: 'uid-m' });
    assert.equal(store.listRecipients().length, 2);

    assert.equal(store.removeRecipient('COLLEAGUE@example.com'), true, 'removal is case-insensitive');
    assert.deepEqual(store.listRecipients().map((r) => r.email), ['second@example.com']);

    assert.equal(store.removeRecipient('nobody@example.com'), false);
    assert.equal(store.removeRecipient('not-an-email'), false);
    assert.throws(() => store.addRecipient({ email: 'not-an-email', addedByUid: 'uid-m' }), /valid email/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('recipient list is independent of per-user preferences', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mail-recipients-mix-'));
  try {
    const store = createMailingPreferencesStore(join(dir, 'test.sqlite'));
    store.upsert({ userUid: 'u1', email: 'self@example.com', language: 'ru' });
    store.addRecipient({ email: 'shared@example.com', addedByUid: 'u1' });

    assert.deepEqual(store.listDigestSubscribers().map((s) => s.email), ['self@example.com']);
    assert.deepEqual(store.listRecipients().map((r) => r.email), ['shared@example.com']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
