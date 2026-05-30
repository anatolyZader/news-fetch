import test from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';
import {
  selectArticlePromptSpans,
  formatRetrievedSpansBlock,
} from '../../../cross-cut-modules/retrieval/pipelineRetrieval.js';

test('selectArticlePromptSpans returns merged chunk text for source_id', async () => {
  process.env.RAG_PIPELINE_ENABLED = '1';
  process.env.RESILIENCE_EXTRACT_RAG_ENABLED = '1';
  process.env.VECTOR_INDEX_EMBEDDINGS = '0';
  delete process.env.COHERE_API_KEY;

  const dbPath = join(tmpdir(), `pipe-rag-${randomUUID()}.sqlite`);
  const svc = createRetrievalService({ dbPath });
  const sourceId = 'archive:news:pipe-test';

  await svc.indexArchiveRow({
    source_id: sourceId,
    date: '2026-03-20',
    source_type: 'news',
    title: 'מקלטים בחיפה',
    source_url: 'https://example.com/pipe',
    body: 'פסקה ראשונה על מקלטים ציבוריים.\n\nפסקה שנייה על אזעקה ופינוי תושבים.',
  });
  svc.rebuildFts();

  const article = {
    source_id: sourceId,
    title: 'מקלטים בחיפה',
    body: 'ignored when rag hits',
  };
  const promptBody = await selectArticlePromptSpans(article, {
    retrieval: svc.retrieval,
    domainGroupKey: 'A',
    reportDate: '2026-03-20',
  });

  assert.ok(promptBody && promptBody.length > 10);
  assert.match(promptBody, /מקלט/);

  const block = formatRetrievedSpansBlock({
    narrative: [{ source_id: sourceId, chunk_index: 0, text: 'ציטוט מקור', url: 'https://example.com/pipe' }],
  });
  assert.match(block, /RETRIEVED PRIMARY SOURCES/);
  assert.ok(block.includes(sourceId));

  svc.close();
  try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* ignore */ }
});
