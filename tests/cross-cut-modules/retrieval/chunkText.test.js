import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, buildChunkId, parseChunkId } from '../../../cross-cut-modules/retrieval/chunkText.js';

test('chunkText splits long Hebrew body with overlap', () => {
  const para1 = 'תושבים נכנסו למקלטים ציבוריים בעת האזעקה. '.repeat(30);
  const para2 = 'מתנדבים חילקו מזון לקשישים בשכונה. '.repeat(30);
  const body = `${para1}\n\n${para2}`;
  const chunks = chunkText(body, { targetChars: 500, overlapRatio: 0.15 });
  assert.ok(chunks.length >= 2);
  assert.equal(chunks[0].chunkIndex, 0);
  for (const c of chunks) {
    assert.ok(c.text.length > 0);
    assert.ok(c.charEnd > c.charStart);
  }
});

test('chunkText returns empty for blank input', () => {
  assert.deepEqual(chunkText(''), []);
});

test('buildChunkId and parseChunkId round-trip', () => {
  const id = buildChunkId('archive:news:abc', 2);
  assert.equal(id, 'archive:news:abc#c2');
  assert.deepEqual(parseChunkId(id), { parentId: 'archive:news:abc', chunkIndex: 2 });
});
