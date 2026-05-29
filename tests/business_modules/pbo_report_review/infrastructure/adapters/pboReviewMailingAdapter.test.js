import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPboReviewMailingAdapter } from '../../../../../business_modules/pbo_report_review/infrastructure/adapters/pboReviewMailingAdapter.js';

describe('pboReviewMailingAdapter', () => {
  it('renders en/he/ru subjects and bodies', async () => {
    const sent = [];
    const deliveryPort = {
      async sendTransactional(payload) {
        sent.push(payload);
        return { id: 'test-id' };
      },
    };
    const adapter = createPboReviewMailingAdapter({
      deliveryPort,
      mailFrom: 'noreply@test.com',
      appBaseUrl: 'https://example.com',
      inboundDomain: 'inbound.test.com',
    });

    for (const lang of ['en', 'he', 'ru']) {
      await adapter.sendMunicipalFollowUp({
        to: 'officer@test.com',
        language: lang,
        date: '2026-05-28',
        municipality: 'Test City',
        reviewToken: 'tok123',
        questions: [{ gapId: 'narrative:missing_verbal_text', label: 'Narrative', text: 'What story?' }],
      });
    }

    assert.equal(sent.length, 3);
    assert.match(sent[0].subject, /information needed/i);
    assert.match(sent[1].subject, /נדרשת השלמת מידע/);
    assert.match(sent[2].subject, /дополнительная информация/i);
    assert.equal(sent[0].replyTo, 'pbo-review+tok123@inbound.test.com');
    assert.ok(sent[0].html.includes('What story?'));
  });
});
