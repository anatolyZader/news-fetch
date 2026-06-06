import test from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';
import {
  retrieveSimilarArticles,
  retrieveCatalogNeighbors,
  retrievePboHistory,
  buildValidationReviewContext,
} from '../../../cross-cut-modules/retrieval/analystRetrieval.js';

function cleanup(dbPath) {
  try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* ignore */ }
}

test('retrieveSimilarArticles excludes same parent and returns archive hits', async () => {
  process.env.RAG_PIPELINE_ENABLED = '1';
  process.env.VALIDATION_REVIEW_RAG_ENABLED = '1';
  process.env.VECTOR_INDEX_EMBEDDINGS = '0';
  delete process.env.COHERE_API_KEY;

  const dbPath = join(tmpdir(), `analyst-rag-${randomUUID()}.sqlite`);
  const svc = createRetrievalService({ dbPath });
  const selfId = 'archive:news:self-article';
  const otherId = 'archive:news:other-article';

  await svc.indexArchiveRow({
    source_id: selfId,
    date: '2026-05-28',
    source_type: 'news',
    title: 'מקלטים בחיפה',
    source_url: 'https://example.com/self',
    body: 'מקלטים ציבוריים ופינוי תושבים בעיר חיפה.',
  });
  await svc.indexArchiveRow({
    source_id: otherId,
    date: '2026-05-28',
    source_type: 'news',
    title: 'מקלטים בטבריה',
    source_url: 'https://example.com/other',
    body: 'מקלטים ציבוריים ופינוי תושבים בעיר טבריה.',
  });
  svc.rebuildFts();

  const hits = await retrieveSimilarArticles('מקלטים פינוי', {
    retrieval: svc.retrieval,
    sourceId: selfId,
    reportDate: '2026-05-28',
    topK: 5,
  });

  assert.ok(hits.length >= 1);
  assert.ok(hits.every((h) => h.source_id !== selfId));
  assert.ok(hits.some((h) => h.source_id === otherId));

  svc.close();
  cleanup(dbPath);
});

test('retrieveCatalogNeighbors returns nearest catalog entries', async () => {
  process.env.RAG_PIPELINE_ENABLED = '1';
  process.env.SIGNAL_CATALOG_EVOLUTION_RAG_ENABLED = '1';
  process.env.VECTOR_INDEX_EMBEDDINGS = '0';
  delete process.env.COHERE_API_KEY;

  const dbPath = join(tmpdir(), `analyst-catalog-${randomUUID()}.sqlite`);
  const svc = createRetrievalService({ dbPath });
  await svc.catalogIndexWriter.reindexCatalog();
  svc.rebuildFts();

  const { nearest_catalog, counterexamples } = await retrieveCatalogNeighbors(
    'shelter public evacuation',
    svc.retrieval,
  );

  assert.ok(Array.isArray(nearest_catalog));
  assert.ok(nearest_catalog.length > 0);
  assert.ok(nearest_catalog[0].type);
  assert.ok(Array.isArray(counterexamples));

  svc.close();
  cleanup(dbPath);
});

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

test('buildValidationReviewContext returns rag shape when disabled', async () => {
  process.env.VALIDATION_REVIEW_RAG_ENABLED = '0';
  const rag = await buildValidationReviewContext(
    { date: '2026-05-28', signals: [{ evidence: 'x' }] },
    {},
  );
  assert.deepEqual(rag.similar_articles, []);
  assert.equal(rag.same_story, null);
  assert.deepEqual(rag.prior_decisions, []);
});
