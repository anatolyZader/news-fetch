import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSocialMediaCompositeFetchAdapter } from '../../../../../business_modules/social_media/infrastructure/adapters/socialMediaCompositeFetchAdapter.js';

describe('socialMediaCompositeFetchAdapter', () => {
  it('merges X and Telegram results with dedupe', async () => {
    const xFetchAdapter = {
      async fetchByTopic() {
        return {
          posts: [{ id: 'x-1', dedupeKey: 'alpha', platform: 'x', text: 'alpha' }],
          source: 'x_api_v2',
          mode: 'execute',
          accessNotes: ['x note'],
        };
      },
    };
    const telegramFetchAdapter = {
      async fetchByTopic() {
        return {
          posts: [
            { id: 'tg-1', dedupeKey: 'beta', platform: 'telegram_public', text: 'beta' },
            { id: 'tg-dup', dedupeKey: 'alpha', platform: 'telegram_public', text: 'alpha dup' },
          ],
          source: 'telegram_mtproto',
          mode: 'execute',
          accessNotes: ['tg note'],
        };
      },
    };
    const stubFetchAdapter = {
      async fetchByTopic() {
        return { posts: [], source: 'stub', accessNotes: [] };
      },
    };

    const composite = createSocialMediaCompositeFetchAdapter({
      xFetchAdapter,
      telegramFetchAdapter,
      stubFetchAdapter,
    });

    const result = await composite.fetchByTopic({
      topic: 'test',
      platforms: ['x', 'telegram_public'],
      execute: true,
    });

    assert.equal(result.posts.length, 2);
    assert.ok(result.source.includes('x_api_v2'));
    assert.ok(result.source.includes('telegram_mtproto'));
    assert.ok(result.accessNotes.includes('x note'));
    assert.ok(result.accessNotes.includes('tg note'));
  });

  it('returns telegram_unconfigured when only telegram selected and no adapter', async () => {
    const stubFetchAdapter = {
      async fetchByTopic() {
        return { posts: [{ id: 'stub-1', dedupeKey: 's', platform: 'facebook_public' }], source: 'stub' };
      },
    };

    const composite = createSocialMediaCompositeFetchAdapter({
      xFetchAdapter: null,
      telegramFetchAdapter: null,
      stubFetchAdapter,
    });

    const result = await composite.fetchByTopic({
      topic: 'test',
      platforms: ['telegram_public'],
      execute: true,
    });

    assert.equal(result.source, 'telegram_public_unconfigured');
    assert.equal(result.posts.length, 0);
  });

  it('routes non-live platforms to stub only', async () => {
    let stubCalled = false;
    const stubFetchAdapter = {
      async fetchByTopic(opts) {
        stubCalled = true;
        assert.deepEqual(opts.platforms, ['facebook_public']);
        return { posts: [{ id: 'fb-1', dedupeKey: 'fb', platform: 'facebook_public' }], source: 'stub' };
      },
    };

    const composite = createSocialMediaCompositeFetchAdapter({
      xFetchAdapter: null,
      telegramFetchAdapter: null,
      stubFetchAdapter,
    });

    const result = await composite.fetchByTopic({
      topic: 'test',
      platforms: ['facebook_public'],
    });

    assert.ok(stubCalled);
    assert.equal(result.posts.length, 1);
  });
});
