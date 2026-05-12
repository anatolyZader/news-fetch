import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLookupIndex,
  normalizeHebrewFinalLetters,
  resolveByExactStages,
  resolveByFuzzyBest,
} from '../../../../../business_modules/geo/domain/services/resolveLocalityMatch.js';

test('resolveByExactStages matches punctuation-stripped Hebrew', () => {
  const localities = [
    { canonicalKey: 'foo', names: ['בדיקה'], lat: 33, lon: 35, subregionId: 'naftali' },
  ];
  const index = buildLookupIndex(localities);
  const r = resolveByExactStages(index, '"בדיקה"');
  assert.ok(r);
  assert.equal(r.matchMethod, 'punctuation');
});

test('normalizeHebrewFinalLetters maps final mem to standard mem', () => {
  assert.equal(normalizeHebrewFinalLetters('תם'), 'תמ');
});

test('resolveByFuzzyBest includes candidateCount on clear fuzzy win', () => {
  const localities = [
    { canonicalKey: 'kiryat_shmona', names: ['קריית שמונה'], lat: 33.2079, lon: 35.5721, subregionId: 'naftali' },
  ];
  const r = resolveByFuzzyBest(localities, 'קרית שמונה');
  assert.ok('row' in r, 'expected fuzzy resolution for common typo');
  if ('row' in r) {
    assert.equal(r.row.canonicalKey, 'kiryat_shmona');
    assert.ok(Number.isInteger(r.candidateCount));
    assert.ok(r.candidateCount >= 1);
    assert.ok(Array.isArray(r.topCandidates));
    assert.ok(r.topCandidates.length >= 1);
  }
});
