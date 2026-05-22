import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSocialMediaFsAdapter } from '../../../../business_modules/social_media/infrastructure/adapters/socialMediaFsAdapter.js';
import { createSocialMediaDailyFeedService } from '../../../../business_modules/social_media/app/socialMediaDailyFeedService.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const dataDir = resolve(repoRoot, 'business_modules/social_media/data');

describe('socialMediaDailyFeedService', () => {
  it('returns categorized deduped feed for a date', async () => {
    const persistencePort = createSocialMediaFsAdapter({ dataDir });
    const daily = createSocialMediaDailyFeedService({ persistencePort });
    const feed = await daily.getDailyFeed('2026-05-21');
    assert.ok(feed);
    assert.equal(feed.date, '2026-05-21');
    assert.ok(feed.stats.afterDedup >= 1);
    assert.ok(Array.isArray(feed.categories));
    assert.ok(feed.categories.every((c) => c.labelKey.startsWith('socialMedia.category.')));
  });

  it('filters by category when requested', async () => {
    const persistencePort = createSocialMediaFsAdapter({ dataDir });
    const daily = createSocialMediaDailyFeedService({ persistencePort });
    const feed = await daily.getDailyFeed('2026-05-21', { categoryId: 'alerts_shelter' });
    assert.equal(feed.categories.length, 1);
    assert.equal(feed.categories[0].id, 'alerts_shelter');
  });

  it('translates category posts when lang is provided', async () => {
    const persistencePort = createSocialMediaFsAdapter({ dataDir });
    let translateCalls = 0;
    const translatePosts = async (posts, lang) => {
      translateCalls += 1;
      return posts.map((p) => ({ ...p, text: `[${lang}] ${p.text}`, translatedTo: lang }));
    };
    const daily = createSocialMediaDailyFeedService({ persistencePort, translatePosts });
    const feed = await daily.getDailyFeed('2026-05-21', { lang: 'en' });
    assert.equal(feed.lang, 'en');
    assert.ok(translateCalls >= 1);
    const firstPost = feed.categories.flatMap((c) => c.posts ?? [])[0];
    assert.match(firstPost.text, /^\[en\] /);
  });
});
