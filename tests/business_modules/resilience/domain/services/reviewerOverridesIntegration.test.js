import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  scoreComponents,
  overallScore,
} from '../../../../../business_modules/resilience/domain/services/behaviorSignals.js';
import { applyReviewerScoreAdjustmentsToScoredMap } from '../../../../../business_modules/resilience/domain/services/reviewerScoreAdjustments.js';

function obs(idx, type, source = 'ynet.co.il') {
  return {
    article_index: idx,
    article_url: `https://${source}/${type}-${idx}`,
    article_source: source,
    source_type: 'news',
    signal_type: type,
    evidence_type: 'observational_reported_fact',
    scope_level: 'repeated_pattern',
    evidence: `obs ${type} ${idx} from ${source}`,
    extraction_confidence: 0.9,
    temporal_weight: 1.0,
  };
}

describe('reviewer-overrides v2 integration with scoreComponents output', () => {
  it('blend mode shifts score toward reviewer (default alpha) and recomputes overall', () => {
    const signals = [
      obs(1, 'compliance_enter_shelter'),
      obs(2, 'compliance_enter_shelter', 'maariv.co.il'),
      obs(3, 'compliance_enter_shelter', 'kan.org.il'),
      obs(4, 'leadership_visible_presence'),
      obs(5, 'leadership_visible_presence', 'maariv.co.il'),
    ];
    const scored = scoreComponents(signals, { totalArticles: 5 });
    const target = scored.lifesaving_behavior;
    assert.ok(target?.score != null, 'baseline component should have a score');

    // Pick a proposed value far from the model so the integer-rounded blend changes.
    const proposed = target.score >= 5 ? 1 : 10;
    const alpha = 0.5;
    const overrides = [
      {
        kind: 'challenge_score',
        component_id: 'lifesaving_behavior',
        proposed: { score: proposed },
        created_at: '2026-05-04T10:00:00Z',
      },
    ];

    const adjusted = applyReviewerScoreAdjustmentsToScoredMap(scored, overrides, { mode: 'blend', alpha });

    const expected = Math.max(1, Math.min(10, Math.round(alpha * target.score + (1 - alpha) * proposed)));
    assert.equal(adjusted.lifesaving_behavior.score_deterministic, target.score);
    assert.equal(adjusted.lifesaving_behavior.score, expected);
    assert.notEqual(adjusted.lifesaving_behavior.score, target.score);
    assert.equal(adjusted.lifesaving_behavior.reviewer_score_adjusted, true);

    const baselineOverall = overallScore(scored);
    const adjustedOverall = overallScore(adjusted);
    assert.ok(adjustedOverall != null && baselineOverall != null);
    assert.notEqual(adjustedOverall, baselineOverall);
  });

  it('replace mode sets score to proposed and untouched components are unchanged', () => {
    const signals = [
      obs(1, 'compliance_enter_shelter'),
      obs(2, 'compliance_enter_shelter', 'maariv.co.il'),
      obs(3, 'leadership_visible_presence'),
      obs(4, 'leadership_visible_presence', 'kan.org.il'),
    ];
    const scored = scoreComponents(signals, { totalArticles: 4 });
    const overrides = [
      {
        kind: 'challenge_score',
        component_id: 'leadership',
        proposed: { score: 9 },
        created_at: '2026-05-04T11:00:00Z',
      },
    ];

    const adjusted = applyReviewerScoreAdjustmentsToScoredMap(scored, overrides, { mode: 'replace' });

    assert.equal(adjusted.leadership.score, 9);
    assert.equal(adjusted.leadership.score_deterministic, scored.leadership.score);
    assert.equal(adjusted.lifesaving_behavior.score, scored.lifesaving_behavior.score);
    assert.equal(adjusted.lifesaving_behavior.score_deterministic, scored.lifesaving_behavior.score);
    assert.notEqual(adjusted.lifesaving_behavior.reviewer_score_adjusted, true);
  });

  it('A9: multiple challenges per component are aggregated by median, not latest-wins', () => {
    const signals = [obs(1, 'compliance_enter_shelter'), obs(2, 'compliance_enter_shelter', 'maariv.co.il')];
    const scored = scoreComponents(signals, { totalArticles: 2 });
    const overrides = [
      {
        kind: 'challenge_score',
        component_id: 'lifesaving_behavior',
        proposed: { score: 1 },
        created_at: '2026-05-04T08:00:00Z',
      },
      {
        kind: 'challenge_score',
        component_id: 'lifesaving_behavior',
        proposed: { score: 10 },
        created_at: '2026-05-04T18:00:00Z',
      },
    ];
    const adjusted = applyReviewerScoreAdjustmentsToScoredMap(scored, overrides, { mode: 'replace' });
    // median of [1, 10] = round((1 + 10) / 2) = 6 (banker-friendly half-up via Math.round)
    assert.equal(adjusted.lifesaving_behavior.score, 6);
    assert.equal(adjusted.lifesaving_behavior.reviewer_proposal_count, 2);
    assert.equal(adjusted.lifesaving_behavior.reviewer_proposal_median, 6);
  });

  it('A9: odd count picks the middle proposal exactly', () => {
    const signals = [obs(1, 'compliance_enter_shelter'), obs(2, 'compliance_enter_shelter', 'maariv.co.il')];
    const scored = scoreComponents(signals, { totalArticles: 2 });
    const overrides = [
      { kind: 'challenge_score', component_id: 'lifesaving_behavior', proposed: { score: 2 }, created_at: '2026-05-04T08:00:00Z' },
      { kind: 'challenge_score', component_id: 'lifesaving_behavior', proposed: { score: 7 }, created_at: '2026-05-04T09:00:00Z' },
      { kind: 'challenge_score', component_id: 'lifesaving_behavior', proposed: { score: 9 }, created_at: '2026-05-04T10:00:00Z' },
    ];
    const adjusted = applyReviewerScoreAdjustmentsToScoredMap(scored, overrides, { mode: 'replace' });
    assert.equal(adjusted.lifesaving_behavior.score, 7);
    assert.equal(adjusted.lifesaving_behavior.reviewer_proposal_count, 3);
  });

  it('A9: invalid proposed scores are skipped (not coerced to zero)', () => {
    const signals = [obs(1, 'compliance_enter_shelter'), obs(2, 'compliance_enter_shelter', 'maariv.co.il')];
    const scored = scoreComponents(signals, { totalArticles: 2 });
    const overrides = [
      { kind: 'challenge_score', component_id: 'lifesaving_behavior', proposed: { score: 4 }, created_at: '2026-05-04T08:00:00Z' },
      { kind: 'challenge_score', component_id: 'lifesaving_behavior', proposed: { score: 11 }, created_at: '2026-05-04T09:00:00Z' },
      { kind: 'challenge_score', component_id: 'lifesaving_behavior', proposed: { score: 6.5 }, created_at: '2026-05-04T10:00:00Z' },
    ];
    const adjusted = applyReviewerScoreAdjustmentsToScoredMap(scored, overrides, { mode: 'replace' });
    assert.equal(adjusted.lifesaving_behavior.score, 4);
    assert.equal(adjusted.lifesaving_behavior.reviewer_proposal_count, 1);
  });
});
