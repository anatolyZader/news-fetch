import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createPboReviewStatePort,
  isAssessPboReviewEnabled,
} from '../../../../business_modules/resilience_scorer/app/assessment/createPboReviewStatePort.js';

describe('createPboReviewStatePort', () => {
  it('returns null when the kill switch is set', async () => {
    const prev = process.env.RESILIENCE_ASSESS_PBO_REVIEW;
    process.env.RESILIENCE_ASSESS_PBO_REVIEW = '0';
    try {
      assert.equal(isAssessPboReviewEnabled(), false);
      assert.equal(await createPboReviewStatePort(), null);
    } finally {
      if (prev === undefined) delete process.env.RESILIENCE_ASSESS_PBO_REVIEW;
      else process.env.RESILIENCE_ASSESS_PBO_REVIEW = prev;
    }
  });

  it('is enabled by default', () => {
    assert.equal(isAssessPboReviewEnabled({}), true);
  });

  it('returns an empty map rather than throwing when a date is unreadable', async () => {
    const port = await createPboReviewStatePort({ sqlitePath: '/nonexistent/dir/app.sqlite' });
    if (port === null) return; // facade unavailable — already fail-open
    const states = await port.loadReviewStates(['2026-04-02']);
    assert.ok(states instanceof Map);
    assert.equal(states.size, 0);
  });
});
