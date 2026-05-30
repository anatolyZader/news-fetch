import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';
import { createPboHistoricalSearchService } from '../../../business_modules/pbo_report_review/app/pboHistoricalSearchService.js';

describe('pboHistoricalSearchService', () => {
  let dbPath;
  /** @type {ReturnType<createRetrievalService>} */
  let retrievalService;
  let prevPboRag;

  afterEach(() => {
    retrievalService?.close();
    try { if (dbPath && existsSync(dbPath)) unlinkSync(dbPath); } catch { /* ignore */ }
    if (prevPboRag === undefined) delete process.env.PBO_REVIEW_RAG_ENABLED;
    else process.env.PBO_REVIEW_RAG_ENABLED = prevPboRag;
  });

  it('returns ranked hits for pbo archive rows', async () => {
    prevPboRag = process.env.PBO_REVIEW_RAG_ENABLED;
    process.env.RAG_PIPELINE_ENABLED = '1';
    process.env.PBO_REVIEW_RAG_ENABLED = '1';
    process.env.VECTOR_INDEX_EMBEDDINGS = '0';
    delete process.env.COHERE_API_KEY;

    dbPath = join(tmpdir(), `pbo-search-${randomUUID()}.sqlite`);
    retrievalService = createRetrievalService({ dbPath });
    await retrievalService.indexArchiveRow({
      source_id: 'archive:pbo:haifa',
      date: '2026-05-28',
      source_type: 'pbo',
      scope_id: 'north',
      title: 'PBO Haifa',
      body: 'Shelter capacity and municipal readiness notes.',
    });
    retrievalService.rebuildFts();

    const service = createPboHistoricalSearchService({ retrievalService });
    const { hits, enabled } = await service.search({
      query: 'shelter capacity',
      date: '2026-05-28',
      district: 'north',
      days: 30,
    });

    assert.equal(enabled, true);
    assert.ok(hits.length >= 1);
    assert.match(hits[0].snippet ?? '', /shelter|Shelter/i);
  });

  it('returns empty when RAG disabled', async () => {
    prevPboRag = process.env.PBO_REVIEW_RAG_ENABLED;
    process.env.PBO_REVIEW_RAG_ENABLED = '0';
    dbPath = join(tmpdir(), `pbo-search-off-${randomUUID()}.sqlite`);
    retrievalService = createRetrievalService({ dbPath });
    const service = createPboHistoricalSearchService({ retrievalService });
    const { hits, enabled } = await service.search({ query: 'test', date: '2026-05-28' });
    assert.equal(enabled, false);
    assert.deepEqual(hits, []);
  });
});
