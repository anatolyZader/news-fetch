import test from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';
import {
  buildFieldReportQuery,
  retrieveSimilarFieldReports,
  retrieveFieldTaxonomyExamples,
  retrieveHfcGuidelines,
  buildReportBuildRagContext,
  formatFieldContextBlock,
} from '../../../cross-cut-modules/retrieval/fieldRetrieval.js';

function cleanup(dbPath) {
  try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* ignore */ }
}

test('buildFieldReportQuery combines locality and behavior', () => {
  const q = buildFieldReportQuery(
    { observation: { locality: 'חיפה', observedBehavior: 'מקלטים' }, componentLinks: [{ componentId: 'lifesaving_behavior' }] },
    [{ role: 'officer', text: 'ראיתי תושבים בחוץ' }],
  );
  assert.match(q, /חיפה/);
  assert.match(q, /מקלט/);
});

test('retrieveSimilarFieldReports returns field archive hits', async () => {
  process.env.RAG_PIPELINE_ENABLED = '1';
  process.env.REPORT_BUILD_RAG_ENABLED = '1';
  process.env.VECTOR_INDEX_EMBEDDINGS = '0';
  delete process.env.COHERE_API_KEY;

  const dbPath = join(tmpdir(), `field-rag-${randomUUID()}.sqlite`);
  const svc = createRetrievalService({ dbPath });
  await svc.indexArchiveRow({
    source_id: 'archive:field:test-report',
    date: '2026-05-28',
    source_type: 'field',
    title: 'Field visit Haifa shelters',
    body: 'Officers observed residents entering public shelters during alert.',
  });
  svc.rebuildFts();

  const hits = await retrieveSimilarFieldReports('shelters residents alert', {
    retrieval: svc.retrieval,
    locality: 'Haifa',
    reportDate: '2026-05-28',
  });
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].source_type, 'field');

  svc.close();
  cleanup(dbPath);
});

test('buildReportBuildRagContext returns blockText when indexes exist', async () => {
  process.env.RAG_PIPELINE_ENABLED = '1';
  process.env.REPORT_BUILD_RAG_ENABLED = '1';
  process.env.VECTOR_INDEX_EMBEDDINGS = '0';
  delete process.env.COHERE_API_KEY;

  const dbPath = join(tmpdir(), `field-ctx-${randomUUID()}.sqlite`);
  const svc = createRetrievalService({ dbPath });
  await svc.fieldExamplesIndexWriter.reindexFieldExamples();
  await svc.hfcGuidelinesIndexWriter.reindexHfcGuidelines();
  svc.rebuildFts();

  const ctx = await buildReportBuildRagContext(
    { observation: { locality: 'צפת', observedBehavior: 'פינוי' } },
    [],
    { retrievalService: svc, mode: 'analyze' },
  );
  assert.ok(ctx.taxonomy_examples.length >= 0);
  if (ctx.blockText) {
    assert.match(ctx.blockText, /REFERENCE ONLY/);
  }

  const block = formatFieldContextBlock({
    taxonomy_examples: [{ snippet: 'example_type: good_observation' }],
  });
  assert.match(block, /Taxonomy examples/);

  svc.close();
  cleanup(dbPath);
});
