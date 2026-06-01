import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createChatRetrievalCache,
  chatRetrievalCacheKey,
} from '../../../cross-cut-modules/retrieval/chatRetrievalCache.js';

describe('chatRetrievalCache', () => {
  beforeEach(() => {
    process.env.CHAT_RETRIEVAL_CACHE_TTL_MS = '60000';
  });

  afterEach(() => {
    delete process.env.CHAT_RETRIEVAL_CACHE_TTL_MS;
  });

  it('get/set round-trips session-scoped entries', () => {
    const cache = createChatRetrievalCache('sess-1');
    const key = chatRetrievalCacheKey('sess-1', 'missiles', 'national', '2026-03-01');
    cache.set(key, { hintText: 'hint', searchHits: [{ source_id: 'a' }] });
    const hit = cache.get(key);
    assert.equal(hit.hintText, 'hint');
    assert.equal(hit.searchHits.length, 1);
  });
});
