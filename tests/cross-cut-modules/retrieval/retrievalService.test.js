import test from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';

test('retrievalService indexes archive row and retrieves via FTS when embeddings off', async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldVec = process.env.VECTOR_INDEX_EMBEDDINGS;
  const oldCohere = process.env.COHERE_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.RESILIENCE_EMBEDDING_API_KEY;
  process.env.VECTOR_INDEX_EMBEDDINGS = '0';
  delete process.env.COHERE_API_KEY;

  const dbPath = join(tmpdir(), `rag-svc-${randomUUID()}.sqlite`);
  const svc = createRetrievalService({ dbPath });

  await svc.indexArchiveRow({
    source_id: 'archive:news:test1',
    date: '2026-03-15',
    source_type: 'news',
    title: 'מקלטים',
    source_url: 'https://example.com/1',
    body: 'תושבים נכנסו למקלטים ציבוריים בעיר חיפה במהלך האזעקה.',
  });
  svc.rebuildFts();

  const hits = await svc.retrieval.retrieve({
    query: 'מקלטים חיפה',
    reportData: { assessment: { date: '2026-03-15', report_scope: { id: 'national' } } },
    dateWindowDays: 1,
    topKFinal: 3,
  });

  assert.ok(hits.length >= 1);
  assert.match(hits[0].parentId ?? '', /archive:news:test1/);

  svc.close();
  try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* ignore */ }

  if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = oldKey;
  if (oldVec === undefined) delete process.env.VECTOR_INDEX_EMBEDDINGS;
  else process.env.VECTOR_INDEX_EMBEDDINGS = oldVec;
  if (oldCohere === undefined) delete process.env.COHERE_API_KEY;
  else process.env.COHERE_API_KEY = oldCohere;
});
