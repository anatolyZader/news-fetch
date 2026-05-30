import test from 'node:test';
import assert from 'node:assert/strict';
import { reciprocalRankFusion } from '../../../cross-cut-modules/retrieval/hybridSearch.js';

test('reciprocalRankFusion merges dense and fts lists', () => {
  const dense = [
    { chunkId: 'a#c0', text: 'a' },
    { chunkId: 'b#c0', text: 'b' },
  ];
  const fts = [
    { chunkId: 'b#c0', text: 'b' },
    { chunkId: 'c#c0', text: 'c' },
  ];
  const fused = reciprocalRankFusion(dense, fts, { k: 60, topK: 3 });
  assert.equal(fused.length, 3);
  assert.equal(fused[0].chunkId, 'b#c0');
  assert.ok(fused[0].rrfScore > fused[1].rrfScore);
});
