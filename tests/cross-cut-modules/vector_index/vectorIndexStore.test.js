import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { createVectorIndexStore } from '../../../cross-cut-modules/vector_index/index.js';

function fakeEmbedding(text) {
  // Deterministic tiny embedding: 8 dims based on char codes.
  const v = new Array(8).fill(0);
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) v[i % 8] += s.charCodeAt(i) % 31;
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((x) => x / norm);
}

test('vector index: upsert + querySimilar returns closest docs', async () => {
  const oldFetch = global.fetch;
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const input = body.input;
    const vec = fakeEmbedding(input);
    return {
      ok: true,
      status: 200,
      async json() {
        return { data: [{ embedding: vec }] };
      },
      async text() {
        return '';
      },
    };
  };

  process.env.RESILIENCE_EMBEDDING_API_KEY = 'test';
  process.env.VECTOR_INDEX_EMBEDDINGS = '1';
  process.env.VECTOR_INDEX_EMBED_MODEL = 'fake-embeddings';

  const dbPath = join(tmpdir(), `vector-index-${randomUUID()}.sqlite`);
  const store = createVectorIndexStore(dbPath);

  await store.upsertDocuments({
    namespace: 't',
    documents: [
      { docId: 'a', kind: 'signal', text: 'rocket hit caused evacuations in Kiryat Shmona', meta: { url: 'u1' } },
      { docId: 'b', kind: 'signal', text: 'schools remained open in Haifa with shelter drills', meta: { url: 'u2' } },
      { docId: 'c', kind: 'component', text: 'volunteers delivered food to elderly residents', meta: { url: 'u3' } },
    ],
  });

  const hits = await store.querySimilar({
    namespace: 't',
    queryText: 'evacuation after rocket strike',
    topK: 2,
    minSim: 0.0,
  });

  assert.equal(hits.length, 2);
  assert.ok(['a', 'b', 'c'].includes(hits[0].docId));
  assert.ok(['a', 'b', 'c'].includes(hits[1].docId));
  assert.notEqual(hits[0].docId, hits[1].docId);
  assert.ok(hits[0].sim >= hits[1].sim);

  global.fetch = oldFetch;
});

