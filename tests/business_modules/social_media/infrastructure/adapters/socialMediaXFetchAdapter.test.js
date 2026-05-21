import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSocialMediaFsAdapter } from '../../../../../business_modules/social_media/infrastructure/adapters/socialMediaFsAdapter.js';
import { createSocialMediaXFetchAdapter } from '../../../../../business_modules/social_media/infrastructure/adapters/socialMediaXFetchAdapter.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const dataDir = resolve(repoRoot, 'business_modules/social_media/data');

describe('socialMediaXFetchAdapter', () => {
  it('dry-run returns queries and cost estimate without search', async () => {
    const persistencePort = createSocialMediaFsAdapter({ dataDir });
    let searchCalls = 0;
    const xApiClient = {
      async countsRecent() {
        return { meta: { total_tweet_count: 12 } };
      },
      async searchRecent() {
        searchCalls += 1;
        return { data: [], includes: { users: [] } };
      },
    };

    const adapter = createSocialMediaXFetchAdapter({ xApiClient, persistencePort, dataDir });
    const result = await adapter.fetchByTopic({ topic: 'מקלטים', execute: false });

    assert.equal(result.mode, 'dry_run');
    assert.equal(result.posts.length, 0);
    assert.ok(result.dryRun?.queries?.he);
    assert.ok(result.dryRun?.estimate?.estTotalX > 0);
    assert.equal(searchCalls, 0);
  });
});
