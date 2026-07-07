import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, jaccard } from '../../../../../business_modules/resilience_scorer/domain/services/textSimilarity.js';

describe('textSimilarity', () => {
  it('tokenizes Hebrew and ASCII', () => {
    assert.ok(tokenize('Hello עולם').length >= 2);
  });

  it('computes jaccard between sets', () => {
    const a = new Set(['a', 'b']);
    const b = new Set(['b', 'c']);
    assert.equal(jaccard(a, b), 1 / 3);
  });
});
