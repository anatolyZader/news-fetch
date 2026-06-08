import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  buildExtractCacheKey,
  createExtractionCacheStore,
  articleContentHash,
  resetExtractionCacheStoreForTests,
} from '../../../cross-cut-modules/llm/cache/extractionCacheStore.js';
import {
  partitionArticlesByExtractCache,
} from '../../../cross-cut-modules/llm/cache/extractionCacheIntegration.js';
import { EXTRACT_PROMPT_VERSION } from '../../../cross-cut-modules/resilience-contracts/extractionPrompt.js';

describe('extractionCacheStore', () => {
  it('stores and retrieves signals by cache key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ext-cache-'));
    const dbPath = join(dir, 'test.sqlite');
    const store = createExtractionCacheStore(dbPath);
    const key = buildExtractCacheKey({
      contentHash: 'abc123',
      catalogVersion: 'v6',
      promptVersion: 'extract-v1',
      contentKind: 'news',
      domainGroup: 'A',
      model: 'claude-haiku-4-5-20251001',
      multipassMode: '0',
    });
    store.putCachedSignals(key, {
      contentHash: 'abc123',
      catalogVersion: 'v6',
      promptVersion: 'extract-v1',
      contentKind: 'news',
      domainGroup: 'A',
      model: 'claude-haiku-4-5-20251001',
    }, [{ signal_type: 'fear_expression', evidence: 'test' }]);

    const hit = store.getCachedSignals(key);
    assert.equal(hit.length, 1);
    assert.equal(hit[0].signal_type, 'fear_expression');
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('partitionArticlesByExtractCache', () => {
  it('partitions hits and misses', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ext-part-'));
    const prevDb = process.env.SQLITE_PATH;
    const prevCache = process.env.RESILIENCE_EXTRACT_CACHE;
    process.env.SQLITE_PATH = join(dir, 'part.sqlite');
    process.env.RESILIENCE_EXTRACT_CACHE = '1';
    resetExtractionCacheStoreForTests();

    try {
      const store = createExtractionCacheStore(process.env.SQLITE_PATH);
      const art = { title: 'Test', body: 'Shelter behavior in north', url: 'http://x' };
      const hash = articleContentHash(art);
      const key = buildExtractCacheKey({
        contentHash: hash,
        catalogVersion: 'v6',
        promptVersion: EXTRACT_PROMPT_VERSION,
        contentKind: 'news',
        domainGroup: null,
        model: 'claude-haiku-4-5-20251001',
        multipassMode: '1',
      });
      store.putCachedSignals(key, {
        contentHash: hash,
        catalogVersion: 'v6',
        promptVersion: EXTRACT_PROMPT_VERSION,
        contentKind: 'news',
        model: 'claude-haiku-4-5-20251001',
      }, [{ signal_type: 'compliance_enter_shelter', article_index: 1, evidence: 'entered shelter' }]);
      store.close();

      resetExtractionCacheStoreForTests();
      const { missArticles, cachedSignals } = partitionArticlesByExtractCache([art], {
        model: 'claude-haiku-4-5-20251001',
        contentKind: 'news',
        domainGroupKey: null,
      });
      assert.equal(missArticles.length, 0);
      assert.equal(cachedSignals.length, 1);
    } finally {
      resetExtractionCacheStoreForTests();
      if (prevDb == null) delete process.env.SQLITE_PATH;
      else process.env.SQLITE_PATH = prevDb;
      if (prevCache == null) delete process.env.RESILIENCE_EXTRACT_CACHE;
      else process.env.RESILIENCE_EXTRACT_CACHE = prevCache;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
