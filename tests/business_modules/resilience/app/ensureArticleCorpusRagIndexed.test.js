import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, unlinkSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { createRetrievalService } from '../../../../cross-cut-modules/retrieval/createRetrievalService.js';
import {
  assessRagBackfillEnabled,
  ensureArticleCorpusRagIndexed,
} from '../../../../business_modules/resilience/app/ensureArticleCorpusRagIndexed.js';

const envKeys = ['RAG_PIPELINE_ENABLED', 'RESILIENCE_ASSESS_RAG_BACKFILL', 'VECTOR_INDEX_EMBEDDINGS', 'COHERE_API_KEY'];
const envBackup = {};

function saveEnv() {
  for (const k of envKeys) envBackup[k] = process.env[k];
}

function restoreEnv() {
  for (const k of envKeys) {
    if (envBackup[k] === undefined) delete process.env[k];
    else process.env[k] = envBackup[k];
  }
}

function cleanupDb(dbPath) {
  try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* ignore */ }
}

function writeHomefrontMd(repoRoot, date) {
  const dir = join(repoRoot, 'business_modules/news-sites/articles_extracted');
  mkdirSync(dir, { recursive: true });
  const mdPath = join(dir, `articles-homefront-${date}.md`);
  writeFileSync(mdPath, [
    '# Home Front / population-in-emergency articles (2026-04-05)',
    '',
    '## 1. Test headline',
    '',
    '- **URL:** https://example.com/article-1',
    '- **Published:** 2026-04-05T08:00:00Z',
    '- **Source:** ynet.co.il',
    '',
    'Body text for retrieval indexing test one.',
    '',
    '---',
    '',
    '## 2. Second headline',
    '',
    '- **URL:** https://example.com/article-2',
    '- **Published:** 2026-04-05T09:00:00Z',
    '- **Source:** haaretz.co.il',
    '',
    'Body text for retrieval indexing test two.',
    '',
  ].join('\n'), 'utf8');
  return mdPath;
}

describe('ensureArticleCorpusRagIndexed', () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  it('assessRagBackfillEnabled respects env gates', () => {
    process.env.RAG_PIPELINE_ENABLED = '1';
    delete process.env.RESILIENCE_ASSESS_RAG_BACKFILL;
    assert.equal(assessRagBackfillEnabled(), true);

    process.env.RESILIENCE_ASSESS_RAG_BACKFILL = '0';
    assert.equal(assessRagBackfillEnabled(), false);
  });

  it('indexes missing parents from homefront markdown', async () => {
    process.env.RAG_PIPELINE_ENABLED = '1';
    delete process.env.RESILIENCE_ASSESS_RAG_BACKFILL;
    process.env.VECTOR_INDEX_EMBEDDINGS = '0';
    delete process.env.COHERE_API_KEY;

    const workRoot = join(tmpdir(), `rag-backfill-${randomUUID()}`);
    const dbPath = join(tmpdir(), `rag-backfill-db-${randomUUID()}.sqlite`);
    mkdirSync(workRoot, { recursive: true });
    const date = '2026-04-05';
    writeHomefrontMd(workRoot, date);

    const svc = createRetrievalService({ dbPath });
    try {
      const result = await ensureArticleCorpusRagIndexed({
        targetDate: date,
        days: 1,
        retrievalService: svc,
        repoRoot: workRoot,
        sqlitePath: dbPath,
      });

      assert.equal(result.disabled, undefined);
      assert.equal(result.indexed, 2);
      assert.equal(result.skipped, 0);

      const second = await ensureArticleCorpusRagIndexed({
        targetDate: date,
        days: 1,
        retrievalService: svc,
        repoRoot: workRoot,
        sqlitePath: dbPath,
      });
      assert.equal(second.indexed, 0);
      assert.equal(second.skipped, 2);
    } finally {
      svc.close();
      cleanupDb(dbPath);
      rmSync(workRoot, { recursive: true, force: true });
    }
  });

  it('no-ops when RAG pipeline disabled', async () => {
    process.env.RAG_PIPELINE_ENABLED = '0';
    const result = await ensureArticleCorpusRagIndexed({
      targetDate: '2026-04-05',
      days: 1,
      retrievalService: { indexArchiveRow: async () => ({}) },
      repoRoot: process.cwd(),
    });
    assert.equal(result.disabled, true);
    assert.equal(result.indexed, 0);
  });
});
