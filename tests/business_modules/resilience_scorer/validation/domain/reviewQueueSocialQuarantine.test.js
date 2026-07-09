import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildReviewQueue } from '../../../../../business_modules/resilience_scorer/analyst/validation/domain/reviewQueueBuilder.js';
import { SOCIAL_QUARANTINE_ARTICLE_KEY } from '../../../../../business_modules/resilience_scorer/domain/services/socialChannelQuarantine.js';

describe('reviewQueue social quarantine', () => {
  it('injects epistemic item when social quarantine suggested', () => {
    const queue = buildReviewQueue({
      assessment: {
        date: '2026-05-20',
        report_scope: { id: 'national' },
        social_channel_quarantine: {
          suggested: true,
          active: false,
          social_signal_count: 6,
          social_polarization: 0.9,
          social_share: 0.4,
        },
        components: [],
      },
      signals: [
        { source_type: 'social', signal_type: 'fear_expression', article_index: 1 },
        { source_type: 'news', signal_type: 'service_disruption', article_url: 'https://x.com/1' },
      ],
    });

    const item = queue.items.find((i) => i.article_key === SOCIAL_QUARANTINE_ARTICLE_KEY);
    assert.ok(item, 'expected synthetic epistemic queue item');
    assert.ok(item.reasons.some((r) => r.code === 'social_quarantine_suggested'));
  });

  it('omits epistemic item when quarantine active', () => {
    const queue = buildReviewQueue({
      assessment: {
        date: '2026-05-20',
        social_channel_quarantine: { suggested: true, active: true },
        components: [],
      },
      signals: [],
    });
    assert.equal(
      queue.items.find((i) => i.article_key === SOCIAL_QUARANTINE_ARTICLE_KEY),
      undefined,
    );
  });
});
