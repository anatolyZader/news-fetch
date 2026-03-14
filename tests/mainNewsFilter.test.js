import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isMainNewsUrl, NON_NEWS_PATH_SEGMENTS } from '../src/mainNewsFilter.js';

describe('mainNewsFilter', () => {
  describe('isMainNewsUrl', () => {
    it('returns false for empty or missing url', () => {
      assert.strictEqual(isMainNewsUrl(''), false);
      assert.strictEqual(isMainNewsUrl(null), false);
      assert.strictEqual(isMainNewsUrl(undefined), false);
    });

    it('returns false when URL contains non-news path segment', () => {
      assert.strictEqual(isMainNewsUrl('https://ynet.co.il/sport/article/123'), false);
      assert.strictEqual(isMainNewsUrl('https://example.com/entertainment/news'), false);
      assert.strictEqual(isMainNewsUrl('https://site.co.il/food/recipe'), false);
      assert.strictEqual(isMainNewsUrl('https://site.co.il/activism/page'), false);
      assert.strictEqual(isMainNewsUrl('https://site.co.il/rechilut/item'), false);
    });

    it('returns true for news and economy paths', () => {
      assert.strictEqual(isMainNewsUrl('https://ynet.co.il/news/article/abc'), true);
      assert.strictEqual(isMainNewsUrl('https://ynet.co.il/economy/article/xyz'), true);
      assert.strictEqual(isMainNewsUrl('https://haaretz.co.il/news/politics/1'), true);
    });
  });

  describe('NON_NEWS_PATH_SEGMENTS', () => {
    it('is a non-empty array', () => {
      assert(Array.isArray(NON_NEWS_PATH_SEGMENTS));
      assert(NON_NEWS_PATH_SEGMENTS.length > 0);
    });
  });
});
