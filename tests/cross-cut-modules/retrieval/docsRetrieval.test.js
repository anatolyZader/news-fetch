import test from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';
import { searchProductDocs } from '../../../cross-cut-modules/retrieval/docsRetrieval.js';
import { DOCS_INDEX_DATE } from '../../../cross-cut-modules/retrieval/docsIndexWriter.js';

function cleanup(dbPath) {
  try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* ignore */ }
}

test('searchProductDocs returns docs namespace hit by slug', async () => {
  process.env.RAG_PIPELINE_ENABLED = '1';
  process.env.DOCS_RAG_ENABLED = '1';
  process.env.VECTOR_INDEX_EMBEDDINGS = '0';
  delete process.env.COHERE_API_KEY;

  const dbPath = join(tmpdir(), `docs-rag-${randomUUID()}.sqlite`);
  const svc = createRetrievalService({ dbPath });
  await svc.indexWriter.indexChunksForParent({
    namespace: 'docs',
    parentId: 'docs:troubleshooting/data-void',
    date: DOCS_INDEX_DATE,
    body: 'slug: troubleshooting/data-void\ntitle: Data void\ngated: false\n\nUsers document data voids and abstention rules.',
    sourceType: 'docs',
    title: 'Data void',
    kind: 'docs_public',
    scopeId: 'test',
  });
  svc.rebuildFts();

  const hits = await searchProductDocs('data void abstention', { retrieval: svc.retrieval });
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].slug, 'troubleshooting/data-void');
  assert.equal(hits[0].gated, false);

  svc.close();
  cleanup(dbPath);
});
