import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  validationRagCacheKey,
  getValidationRagCache,
  setValidationRagCache,
  clearValidationRagCache,
} from '../../../cross-cut-modules/retrieval/validationRagContextCache.js';

describe('validationRagContextCache', () => {
  beforeEach(() => {
    clearValidationRagCache();
    process.env.VALIDATION_RAG_CACHE_TTL_MS = '60000';
  });

  afterEach(() => {
    clearValidationRagCache();
    delete process.env.VALIDATION_RAG_CACHE_TTL_MS;
  });

  it('stores and retrieves by key', () => {
    const key = validationRagCacheKey('2026-03-01', 'national', 'url:abc');
    setValidationRagCache(key, { rag: { similar_articles: [] }, article: { title: 't' } });
    const hit = getValidationRagCache(key);
    assert.equal(hit.article.title, 't');
  });

  it('expires after TTL', async () => {
    process.env.VALIDATION_RAG_CACHE_TTL_MS = '1';
    const key = validationRagCacheKey('2026-03-01', 'national', 'k1');
    setValidationRagCache(key, { rag: {}, article: null });
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(getValidationRagCache(key), null);
  });
});
