import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { migrateSelfAddressToList } from '../../../../business_modules/mailing/app/migrateSelfAddress.js';

function fakeStore(prefsSeed = {}) {
  const prefs = new Map(Object.entries(prefsSeed));
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
    addRecipient: ({ email, addedByUid }) => {
      const normalized = String(email).trim().toLowerCase();
      if (!recipients.some((r) => r.email === normalized)) {
        recipients.push({ email: normalized, addedByUid });
      }
    },
  };
}

describe('migrateSelfAddressToList', () => {
  let store;
  beforeEach(() => {
    store = fakeStore({
      'uid-m': { email: 'Boss@Srulik.AI', language: 'he', products: { report: true } },
    });
  });

  it('moves the personal destination onto the list and blanks it', () => {
    const result = migrateSelfAddressToList({ prefsStore: store, userUid: 'uid-m' });

    assert.deepEqual(result, { migrated: true, email: 'boss@srulik.ai' });
    assert.deepEqual(store.recipients, [{ email: 'boss@srulik.ai', addedByUid: 'uid-m' }]);
    assert.equal(store.prefs.get('uid-m').email, '', 'personal destination is cleared');
  });

  it('keeps the language and products that the list inherits', () => {
    migrateSelfAddressToList({ prefsStore: store, userUid: 'uid-m' });

    const row = store.prefs.get('uid-m');
    assert.equal(row.language, 'he');
    assert.deepEqual(row.products, { report: true });
  });

  it('is idempotent — a second run does nothing', () => {
    migrateSelfAddressToList({ prefsStore: store, userUid: 'uid-m' });
    const second = migrateSelfAddressToList({ prefsStore: store, userUid: 'uid-m' });

    assert.deepEqual(second, { migrated: false });
    assert.equal(store.recipients.length, 1, 'no duplicate list entry');
    assert.equal(store.prefs.get('uid-m').email, '');
  });

  it('does not add the account email when the destination is already empty', () => {
    const empty = fakeStore({ 'uid-x': { email: '', language: 'en', products: {} } });
    const result = migrateSelfAddressToList({ prefsStore: empty, userUid: 'uid-x' });

    // Such a user is skipped by the daily cron today; adding them would start
    // sending mail that was not being sent before.
    assert.deepEqual(result, { migrated: false });
    assert.deepEqual(empty.recipients, []);
  });

  it('is a no-op for an unknown uid or a missing uid', () => {
    for (const uid of ['uid-nobody', '', null, undefined]) {
      assert.deepEqual(migrateSelfAddressToList({ prefsStore: store, userUid: uid }), { migrated: false });
    }
    assert.deepEqual(store.recipients, []);
  });

  it('does not disturb an address already on the list', () => {
    store.addRecipient({ email: 'boss@srulik.ai', addedByUid: 'someone-else' });
    migrateSelfAddressToList({ prefsStore: store, userUid: 'uid-m' });

    assert.equal(store.recipients.length, 1);
    assert.equal(store.prefs.get('uid-m').email, '');
  });
});
