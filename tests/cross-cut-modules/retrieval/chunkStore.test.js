import test from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createChunkStore } from '../../../cross-cut-modules/retrieval/chunkStore.js';

test('chunkStore upsert, fts search, and dense search', () => {
  const dbPath = join(tmpdir(), `rag-chunks-${randomUUID()}.sqlite`);
  const store = createChunkStore(dbPath);

  const v = new Float32Array([1, 0, 0, 0]);
  const v2 = new Float32Array([0.9, 0.1, 0, 0]);

  store.upsertChunk({
    chunk_id: 'src1#c0',
    namespace: 'archive',
    parent_id: 'src1',
    chunk_index: 0,
    date: '2026-03-01',
    source_type: 'news',
    title: 'Shelter alert',
    chunk_text: 'Residents entered public shelters during the alert in Haifa.',
    text_hash: 'h1',
  }, { vector: v, model: 'test' });

  store.upsertChunk({
    chunk_id: 'src2#c0',
    namespace: 'archive',
    parent_id: 'src2',
    chunk_index: 0,
    date: '2026-03-01',
    source_type: 'news',
    title: 'Schools',
    chunk_text: 'Schools remained open with routine drills only.',
    text_hash: 'h2',
  }, { vector: v2, model: 'test' });

  const dense = store.denseSearch({
    namespace: 'archive',
    dateFrom: '2026-03-01',
    dateTo: '2026-03-01',
    queryVector: v,
    topK: 2,
    minSim: 0.5,
  });
  assert.equal(dense[0].chunkId, 'src1#c0');

  const fts = store.ftsSearch({
    namespace: 'archive',
    dateFrom: '2026-03-01',
    dateTo: '2026-03-01',
    query: 'shelters Haifa',
    topK: 2,
  });
  assert.ok(fts.some((h) => h.chunkId === 'src1#c0'));

  store.close();
  try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* ignore */ }
});
