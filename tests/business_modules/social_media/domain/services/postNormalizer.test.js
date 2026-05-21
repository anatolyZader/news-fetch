import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findingsToDedupedPosts } from '../../../../../business_modules/social_media/domain/services/postNormalizer.js';

describe('postNormalizer.findingsToDedupedPosts', () => {
  it('removes duplicate quotes and empty text', () => {
    const { posts, duplicatesRemoved } = findingsToDedupedPosts([
      { id: 'a', quote_original: 'Same quote', platform: 'x' },
      { id: 'b', quote_original: 'Same quote', platform: 'x' },
      { id: 'c', quote_original: '   ', platform: 'x' },
      { id: 'd', quote_original: 'Unique quote', platform: 'x' },
    ]);
    assert.equal(posts.length, 2);
    assert.equal(duplicatesRemoved, 1);
    assert.ok(posts.some((p) => p.text === 'Unique quote'));
  });
});
