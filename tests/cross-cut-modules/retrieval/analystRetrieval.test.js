import test from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';
import { retrievePboHistory } from '../../../cross-cut-modules/retrieval/analystRetrieval.js';

function cleanup(dbPath) {
  try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* ignore */ }
}

test('retrievePboHistory filters to pbo source types', async () => {
  process.env.RAG_PIPELINE_ENABLED = '1';
  process.env.PBO_REVIEW_RAG_ENABLED = '1';
  process.env.VECTOR_INDEX_EMBEDDINGS = '0';
  delete process.env.COHERE_API_KEY;

  const dbPath = join(tmpdir(), `analyst-pbo-${randomUUID()}.sqlite`);
  const svc = createRetrievalService({ dbPath });

  await svc.indexArchiveRow({
    source_id: 'archive:pbo:test-muni',
    date: '2026-05-28',
    source_type: 'pbo',
    scope_id: 'north',
    title: 'PBO Test Municipality',
    body: 'Component A score 3. Observer notes about shelter readiness.',
  });
  await svc.indexArchiveRow({
    source_id: 'archive:news:noise',
    date: '2026-05-28',
    source_type: 'news',
    title: 'News noise',
    body: 'shelter readiness headline only',
  });
  svc.rebuildFts();

  const hits = await retrievePboHistory('shelter readiness', {
    retrieval: svc.retrieval,
    districtId: 'north',
    reportDate: '2026-05-28',
    days: 30,
    topK: 5,
  });

  assert.ok(hits.length >= 1);
  assert.ok(hits.every((h) => h.source_type === 'pbo' || h.source_type === 'pbo_regional'));
  assert.ok(hits.some((h) => h.source_id === 'archive:pbo:test-muni'));

  svc.close();
  cleanup(dbPath);
});
