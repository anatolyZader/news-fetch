import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { applyReviewerScoreAdjustmentsToScoredMap } from '../../../../../business_modules/resilience/domain/services/reviewerScoreAdjustments.js';

describe('reviewerScoreAdjustments', () => {
  it('blends proposed score toward model with default alpha', () => {
    const scored = {
      narrative: { score: 6, certainty: 0.5, signal_count: 2 },
    };
    const overrides = [
      {
        kind: 'challenge_score',
        component_id: 'narrative',
        proposed: { score: 10 },
        created_at: '2026-05-01T10:00:00Z',
      },
    ];
    const prev = process.env.RESILIENCE_OVERRIDE_SCORE_MODE;
    const prea = process.env.RESILIENCE_OVERRIDE_BLEND_ALPHA;
    delete process.env.RESILIENCE_OVERRIDE_SCORE_MODE;
    process.env.RESILIENCE_OVERRIDE_BLEND_ALPHA = '0.85';
    try {
      const out = applyReviewerScoreAdjustmentsToScoredMap(scored, overrides, {});
      assert.equal(out.narrative.score_deterministic, 6);
      assert.equal(out.narrative.score, 7);
      assert.equal(out.narrative.reviewer_score_adjusted, true);
    } finally {
      if (prev === undefined) delete process.env.RESILIENCE_OVERRIDE_SCORE_MODE;
      else process.env.RESILIENCE_OVERRIDE_SCORE_MODE = prev;
      if (prea === undefined) delete process.env.RESILIENCE_OVERRIDE_BLEND_ALPHA;
      else process.env.RESILIENCE_OVERRIDE_BLEND_ALPHA = prea;
    }
  });

  it('replace mode sets headline to proposed', () => {
    const scored = {
      leadership: { score: 5, certainty: 0.6, signal_count: 3 },
    };
    const overrides = [
      {
        kind: 'challenge_score',
        component_id: 'leadership',
        proposed: { score: 8 },
        created_at: '2026-05-02T12:00:00Z',
      },
    ];
    const out = applyReviewerScoreAdjustmentsToScoredMap(scored, overrides, { mode: 'replace' });
    assert.equal(out.leadership.score_deterministic, 5);
    assert.equal(out.leadership.score, 8);
  });
});
