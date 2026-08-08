import { describe, it } from 'node:test';
import assert from 'node:assert';

import { createMailingService } from '../../../../business_modules/mailing/app/mailingService.js';

const PRODUCTS = { report: true, naftali: false, education: false, platform: false };

function stubDelivery() {
  const sent = [];
  return {
    sent,
    sendTransactional: async (args) => {
      sent.push(args);
      return { id: 'msg_1' };
    },
  };
}

const emptyPools = {
  getNaftaliDashboard: async () => ({}),
  getEducationDashboard: async () => ({}),
};

function makeService(getCachedReport, deliveryPort) {
  return createMailingService({
    deliveryPort,
    mailFrom: 'Srulik <noreply@srulik.ai>',
    getCachedReport,
    poolService: emptyPools,
  });
}

describe('mailingService.sendDigest', () => {
  it('resolves the report exactly once per send', async () => {
    let calls = 0;
    const delivery = stubDelivery();
    const service = makeService(() => {
      calls += 1;
      return { reportDate: '2026-04-03', assessment: { components: [] } };
    }, delivery);

    await service.sendDigest({ to: 'a@b.c', products: PRODUCTS, language: 'en' });
    assert.strictEqual(calls, 1);
  });

  it('uses one edition for both subject and body even if the source shifts mid-send', async () => {
    // A source that changes between calls would, under a double lookup, put one
    // date in the subject and another in the body.
    const dates = ['2026-04-03', '2026-05-23'];
    let i = 0;
    const delivery = stubDelivery();
    const service = makeService(() => {
      const reportDate = dates[Math.min(i, dates.length - 1)];
      i += 1;
      return { reportDate, assessment: { components: [] } };
    }, delivery);

    await service.sendDigest({ to: 'a@b.c', products: PRODUCTS, language: 'en' });

    const mail = delivery.sent[0];
    assert.match(mail.subject, /2026-04-03/);
    assert.match(mail.text, /2026-04-03/);
    assert.doesNotMatch(mail.subject, /2026-05-23/);
    assert.doesNotMatch(mail.text, /2026-05-23/);
    assert.match(mail.headers['X-Entity-Ref-ID'], /2026-04-03/);
  });

  it('falls back to today in the subject when no report resolves', async () => {
    const delivery = stubDelivery();
    const service = makeService(() => null, delivery);

    await service.sendDigest({ to: 'a@b.c', products: PRODUCTS, language: 'en' });

    const today = new Date().toISOString().slice(0, 10);
    assert.match(delivery.sent[0].subject, new RegExp(today));
  });
});
