import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  buildDigestSendList,
  normalizeRecipientEmail,
  DEFAULT_DIGEST_PRODUCTS,
} from '../../../../business_modules/mailing/app/digestRecipients.js';

const ALL_ON = { report: true, naftali: true, education: true, platform: true };
const REPORT_ONLY = { report: true, naftali: false, education: false, platform: false };
const ALL_OFF = { report: false, naftali: false, education: false, platform: false };

describe('buildDigestSendList', () => {
  it('returns an empty list when there is nothing to send', () => {
    assert.deepStrictEqual(buildDigestSendList(), []);
    assert.deepStrictEqual(buildDigestSendList({ subscribers: [], recipients: [] }), []);
  });

  it('gives shared-list addresses the adding maintainer’s language and products', () => {
    const jobs = buildDigestSendList({
      recipients: [{ email: 'colleague@example.com', addedByUid: 'uid-maintainer' }],
      getPrefsByUid: (uid) => (uid === 'uid-maintainer' ? { language: 'he', products: REPORT_ONLY } : null),
    });

    assert.strictEqual(jobs.length, 1);
    assert.strictEqual(jobs[0].email, 'colleague@example.com');
    assert.strictEqual(jobs[0].language, 'he');
    assert.deepStrictEqual(jobs[0].products, REPORT_ONLY);
    assert.strictEqual(jobs[0].source, 'list');
  });

  it('sends once when an address is both a subscriber and on the list, keeping their own prefs', () => {
    const jobs = buildDigestSendList({
      subscribers: [{ userUid: 'u1', email: 'both@example.com', language: 'ru', products: REPORT_ONLY }],
      recipients: [{ email: 'both@example.com', addedByUid: 'uid-maintainer' }],
      getPrefsByUid: () => ({ language: 'he', products: ALL_ON }),
    });

    assert.strictEqual(jobs.length, 1);
    assert.strictEqual(jobs[0].language, 'ru', 'the subscriber’s own preference wins');
    assert.strictEqual(jobs[0].source, 'subscriber');
  });

  it('matches duplicates case-insensitively and normalizes the address', () => {
    const jobs = buildDigestSendList({
      subscribers: [{ userUid: 'u1', email: 'Person@Example.com', language: 'en', products: ALL_ON }],
      recipients: [{ email: '  PERSON@example.COM ', addedByUid: 'm' }],
      getPrefsByUid: () => ({ language: 'he', products: ALL_ON }),
    });

    assert.strictEqual(jobs.length, 1);
    assert.strictEqual(jobs[0].email, 'person@example.com');
  });

  it('falls back to defaults when the adding maintainer has no preferences row', () => {
    const jobs = buildDigestSendList({
      recipients: [{ email: 'orphan@example.com', addedByUid: 'deleted-uid' }],
      getPrefsByUid: () => null,
    });

    assert.strictEqual(jobs[0].language, 'en');
    assert.deepStrictEqual(jobs[0].products, DEFAULT_DIGEST_PRODUCTS);
  });

  it('drops anyone whose products are all disabled', () => {
    const jobs = buildDigestSendList({
      subscribers: [{ userUid: 'u1', email: 'silent@example.com', language: 'en', products: ALL_OFF }],
      recipients: [{ email: 'alsosilent@example.com', addedByUid: 'm' }],
      getPrefsByUid: () => ({ language: 'en', products: ALL_OFF }),
    });

    assert.deepStrictEqual(jobs, []);
  });

  it('keeps every distinct address', () => {
    const jobs = buildDigestSendList({
      subscribers: [{ userUid: 'u1', email: 'a@example.com', language: 'en', products: ALL_ON }],
      recipients: [
        { email: 'b@example.com', addedByUid: 'm' },
        { email: 'c@example.com', addedByUid: 'm' },
      ],
      getPrefsByUid: () => ({ language: 'en', products: ALL_ON }),
    });

    assert.deepStrictEqual(jobs.map((j) => j.email), ['a@example.com', 'b@example.com', 'c@example.com']);
  });
});

describe('normalizeRecipientEmail', () => {
  it('accepts and normalizes a valid address', () => {
    assert.strictEqual(normalizeRecipientEmail('  Person@Example.COM '), 'person@example.com');
  });

  it('rejects anything that is not an address', () => {
    for (const bad of ['', '   ', null, undefined, 'not-an-email', 'a@b', 'a b@c.com', 'a@@b.com']) {
      assert.strictEqual(normalizeRecipientEmail(bad), '', `expected ${JSON.stringify(bad)} to be rejected`);
    }
  });
});
