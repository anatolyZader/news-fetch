import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTrendWindowDays } from '../../../../business_modules/search_trends/domain/trendWindowDays.js';

describe('normalizeTrendWindowDays', () => {
  it('accepts 1, 3, 7 only', () => {
    assert.equal(normalizeTrendWindowDays(1), 1);
    assert.equal(normalizeTrendWindowDays(3), 3);
    assert.equal(normalizeTrendWindowDays(7), 7);
    assert.equal(normalizeTrendWindowDays(30), 7);
    assert.equal(normalizeTrendWindowDays('90', 3), 3);
  });
});
