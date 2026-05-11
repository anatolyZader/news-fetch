import assert from 'node:assert/strict';
import test from 'node:test';

import { diceBigramSimilarity } from '../../../../../business_modules/geo/domain/services/localityStringSimilarity.js';

test('diceBigramSimilarity is 1 for identical strings', () => {
  assert.equal(diceBigramSimilarity('abc', 'abc'), 1);
});

test('diceBigramSimilarity is high for close typos', () => {
  const s = diceBigramSimilarity('קריית שמונה', 'קרית שמונה');
  assert.ok(s > 0.85);
});
