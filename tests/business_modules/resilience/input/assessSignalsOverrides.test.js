import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { createOverridesStore } from '../../../../business_modules/resilience/infrastructure/overridesStore.js';
import { createOverridesService } from '../../../../business_modules/resilience/app/overridesService.js';
import { scoreComponents, overallScore } from '../../../../business_modules/resilience/domain/services/behaviorSignals.js';
import { applyReviewerScoreAdjustmentsToScoredMap } from '../../../../business_modules/resilience/domain/services/reviewerScoreAdjustments.js';

let tmp;

beforeEach(() => {
  tmp = mkdtempSync(resolve(tmpdir(), 'assess-signals-overrides-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

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

describe('assess-signals overrides path (no LLM)', () => {
  it('round-trips an override through the JSONL store and adjusts the merged assessment', () => {
    const store = createOverridesStore({ baseDir: tmp });
    const svc = createOverridesService({ store });

    svc.create({
      uid: 'reviewer-1',
      report_date: '2026-04-22',
      scope: 'national',
      component_id: 'leadership',
      kind: 'challenge_score',
      original: { score: 4 },
      proposed: { score: 9 },
      note: 'mayor visibility was high today',
    });

    const overridesList = svc.list({ date: '2026-04-22', scope: 'national' });
    assert.equal(overridesList.length, 1);
    assert.equal(overridesList[0].component_id, 'leadership');

    const signals = [
      obs(1, 'leadership_visible_presence'),
      obs(2, 'leadership_visible_presence', 'maariv.co.il'),
      obs(3, 'leadership_clear_guidance'),
      obs(4, 'compliance_enter_shelter'),
      obs(5, 'compliance_enter_shelter', 'kan.org.il'),
    ];
    const scored = scoreComponents(signals, { totalArticles: 5 });

    const adjusted = applyReviewerScoreAdjustmentsToScoredMap(scored, overridesList, { mode: 'replace' });
    assert.equal(adjusted.leadership.score, 9);
    assert.equal(adjusted.leadership.score_deterministic, scored.leadership.score);
    assert.equal(adjusted.leadership.reviewer_score_adjusted, true);

    const baselineOverall = overallScore(scored);
    const adjustedOverall = overallScore(adjusted);
    assert.ok(typeof baselineOverall === 'number');
    assert.ok(typeof adjustedOverall === 'number');
    if (scored.leadership.score !== 9) {
      assert.notEqual(adjustedOverall, baselineOverall);
    }
  });

  it('national-scope override is NOT returned for north scope and vice versa', () => {
    const store = createOverridesStore({ baseDir: tmp });
    const svc = createOverridesService({ store });

    svc.create({
      uid: 'reviewer-1',
      report_date: '2026-04-22',
      scope: 'national',
      component_id: 'narrative',
      kind: 'challenge_score',
      proposed: { score: 7 },
    });
    svc.create({
      uid: 'reviewer-2',
      report_date: '2026-04-22',
      scope: 'north',
      component_id: 'narrative',
      kind: 'challenge_score',
      proposed: { score: 3 },
    });

    const nat = svc.list({ date: '2026-04-22', scope: 'national' });
    const north = svc.list({ date: '2026-04-22', scope: 'north' });
    assert.equal(nat.length, 1);
    assert.equal(nat[0].proposed.score, 7);
    assert.equal(north.length, 1);
    assert.equal(north[0].proposed.score, 3);
  });
});
