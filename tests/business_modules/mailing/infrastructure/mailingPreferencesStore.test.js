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
