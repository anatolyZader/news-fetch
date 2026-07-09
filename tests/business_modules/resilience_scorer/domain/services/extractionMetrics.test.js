import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  precisionRecallF1,
  cohensKappa,
} from '../../../../../business_modules/resilience_scorer/analyst/tuning/domain/extractionMetrics.js';

describe('precisionRecallF1', () => {
  it('returns zeros when both lists are empty across all articles', () => {
    const result = precisionRecallF1([{ gold: [], predicted: [] }, { gold: [], predicted: [] }]);
    assert.deepEqual(result.per_type, {});
    assert.deepEqual(result.macro, { precision: 0, recall: 0, f1: 0 });
    assert.deepEqual(result.micro, { precision: 0, recall: 0, f1: 0, tp: 0, fp: 0, fn: 0 });
  });

  it('counts a perfect match as TP=1 / precision=1 / recall=1 / F1=1', () => {
    const result = precisionRecallF1([{
      gold: [{ signal_type: 'fear_expression', evidence: 'Residents in Kiryat Shmona expressed fear.' }],
      predicted: [{ signal_type: 'fear_expression', evidence: 'Residents in Kiryat Shmona expressed fear.' }],
    }]);
    assert.equal(result.per_type.fear_expression.tp, 1);
    assert.equal(result.per_type.fear_expression.fp, 0);
    assert.equal(result.per_type.fear_expression.fn, 0);
    assert.equal(result.per_type.fear_expression.precision, 1);
    assert.equal(result.per_type.fear_expression.recall, 1);
    assert.equal(result.per_type.fear_expression.f1, 1);
  });

  it('counts wrong signal_type as FP+FN (never as TP)', () => {
    const result = precisionRecallF1([{
      gold:      [{ signal_type: 'fear_expression', evidence: 'X' }],
      predicted: [{ signal_type: 'calm_confidence', evidence: 'X' }],
    }]);
    assert.equal(result.per_type.fear_expression.tp, 0);
    assert.equal(result.per_type.fear_expression.fn, 1);
    assert.equal(result.per_type.calm_confidence.fp, 1);
    assert.equal(result.per_type.calm_confidence.tp, 0);
  });

  it('matches paraphrased evidence above containment threshold', () => {
    const longGold = 'Mayor Cohen visited the local school today and personally inspected the shelter setup, reassuring families that classes will resume.';
    const shortPred = 'Mayor Cohen visited the local school today and personally inspected the shelter setup';
    const result = precisionRecallF1([{
      gold:      [{ signal_type: 'leadership_visible_presence', evidence: longGold }],
      predicted: [{ signal_type: 'leadership_visible_presence', evidence: shortPred }],
    }]);
    assert.equal(result.per_type.leadership_visible_presence.tp, 1,
      'short paraphrase that is contained in gold should match');
  });

  it('aggregates micro and macro across multiple articles', () => {
    const pairs = [
      {
        gold:      [{ signal_type: 'fear_expression', evidence: 'A' }, { signal_type: 'calm_confidence', evidence: 'B' }],
        predicted: [{ signal_type: 'fear_expression', evidence: 'A' }],
      },
      {
        gold:      [{ signal_type: 'calm_confidence', evidence: 'C' }],
        predicted: [{ signal_type: 'calm_confidence', evidence: 'C' }, { signal_type: 'panic_behavior', evidence: 'D' }],
      },
    ];
    const result = precisionRecallF1(pairs);
    // TP=2 (fear A in art1, calm C in art2)
    // FP=1 (panic D in art2)
    // FN=1 (calm B in art1)
    assert.equal(result.micro.tp, 2);
    assert.equal(result.micro.fp, 1);
    assert.equal(result.micro.fn, 1);
    assert.equal(result.micro.precision, 0.667);
    assert.equal(result.micro.recall, 0.667);
    assert.equal(result.micro.f1, 0.667);
  });
});

describe('cohensKappa', () => {
  it('returns kappa=1 when gold and predicted agree perfectly on every article', () => {
    const pairs = [
      { gold: [{ signal_type: 'fear_expression', evidence: 'X' }],
        predicted: [{ signal_type: 'fear_expression', evidence: 'X' }] },
      { gold: [{ signal_type: 'calm_confidence', evidence: 'Y' }],
        predicted: [{ signal_type: 'calm_confidence', evidence: 'Y' }] },
      { gold: [], predicted: [] },
    ];
    const result = cohensKappa(pairs, { signalTypes: ['fear_expression', 'calm_confidence'] });
    assert.equal(result.per_type.fear_expression, 1);
    assert.equal(result.per_type.calm_confidence, 1);
    assert.equal(result.macro_kappa, 1);
  });

  it('returns kappa around 0 for random labelling', () => {
    // 4 articles, gold has fear in 2/4, pred has fear in 2/4 (different ones each time)
    const pairs = [
      { gold: [{ signal_type: 'fear_expression', evidence: 'A' }], predicted: [] },
      { gold: [], predicted: [{ signal_type: 'fear_expression', evidence: 'B' }] },
      { gold: [{ signal_type: 'fear_expression', evidence: 'C' }], predicted: [] },
      { gold: [], predicted: [{ signal_type: 'fear_expression', evidence: 'D' }] },
    ];
    const result = cohensKappa(pairs, { signalTypes: ['fear_expression'] });
    assert.ok(result.per_type.fear_expression <= 0,
      `expected kappa <= 0 for systematic disagreement, got ${result.per_type.fear_expression}`);
  });

  it('returns negative kappa when gold and predicted systematically disagree', () => {
    // Gold has the type when pred lacks it, and vice versa, in every article.
    const pairs = [
      { gold: [{ signal_type: 'fear_expression', evidence: 'A' }], predicted: [] },
      { gold: [{ signal_type: 'fear_expression', evidence: 'B' }], predicted: [] },
      { gold: [], predicted: [{ signal_type: 'fear_expression', evidence: 'C' }] },
      { gold: [], predicted: [{ signal_type: 'fear_expression', evidence: 'D' }] },
    ];
    const result = cohensKappa(pairs, { signalTypes: ['fear_expression'] });
    assert.equal(result.per_type.fear_expression, -1);
  });
});
