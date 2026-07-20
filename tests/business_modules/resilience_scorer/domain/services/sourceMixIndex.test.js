import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSourceMix,
  computeComparability,
  buildComparisonContext,
} from '../../../../../business_modules/resilience_scorer/domain/services/sourceMixIndex.js';

describe('sourceMixIndex', () => {
  it('computes structured vs digital shares', () => {
    const mix = computeSourceMix([
      { source_type: 'pbo' },
      { source_type: 'pbo' },
      { source_type: 'news' },
      { source_type: 'radio' },
    ]);
    assert.equal(mix.structured_count, 2);
    assert.equal(mix.digital_count, 2);
    assert.equal(mix.structured_share, 0.5);
  });

  it('flags incomparable mixes when structured share delta exceeds threshold', () => {
    const regional = computeSourceMix([
      { source_type: 'pbo' },
      { source_type: 'pbo' },
      { source_type: 'visits' },
    ]);
    const national = computeSourceMix([
      { source_type: 'news' },
      { source_type: 'news' },
      { source_type: 'radio' },
    ]);
    const cmp = computeComparability(regional, national, 0.35);
    assert.equal(cmp.comparable, false);
    assert.ok(cmp.structured_share_delta > 0.35);
  });

  it('buildComparisonContext attaches scope id', () => {
    const ctx = buildComparisonContext(
      [{ source_type: 'news' }],
      [{ source_type: 'news' }, { source_type: 'pbo' }],
      'north',
    );
    assert.equal(ctx.scope, 'north');
    assert.equal(ctx.comparison_scope, 'national');
  });
});
