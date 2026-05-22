import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSocialMediaFsAdapter } from '../../../../business_modules/social_media/infrastructure/adapters/socialMediaFsAdapter.js';
import { createSocialMediaStubFetchAdapter } from '../../../../business_modules/social_media/infrastructure/adapters/socialMediaStubFetchAdapter.js';
import { createSocialMediaTopicFetchService } from '../../../../business_modules/social_media/app/socialMediaTopicFetchService.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const dataDir = resolve(repoRoot, 'business_modules/social_media/data');

describe('socialMediaTopicFetchService', () => {
  it('fetches posts matching topic from cached OSINT', async () => {
    const persistencePort = createSocialMediaFsAdapter({ dataDir });
    const fetchPort = createSocialMediaStubFetchAdapter({ persistencePort });
    const topic = createSocialMediaTopicFetchService({ persistencePort, fetchPort });

    const result = await topic.fetchByTopic({
      topic: 'נהריה',
      platforms: ['x', 'hebrew_forums'],
    });

    assert.equal(result.topic, 'נהריה');
    assert.ok(Array.isArray(result.posts));
    assert.ok(result.stats.matched >= result.stats.afterDedup);
    assert.ok(Array.isArray(result.accessNotes));
  });

  it('rejects very short topics', async () => {
    const persistencePort = createSocialMediaFsAdapter({ dataDir });
    const fetchPort = createSocialMediaStubFetchAdapter({ persistencePort });
    const topic = createSocialMediaTopicFetchService({ persistencePort, fetchPort });

    await assert.rejects(
      () => topic.fetchByTopic({ topic: 'a' }),
      /at least 2 characters/,
    );
  });

  it('lists and loads saved topic fetches from disk', async () => {
    const persistencePort = createSocialMediaFsAdapter({ dataDir });
    const list = persistencePort.listTopicFetches(5);
    assert.ok(Array.isArray(list));
    if (list.length === 0) return;
    const first = list[0];
    assert.ok(first.id);
    assert.ok(first.topic);
    const full = await persistencePort.loadTopicFetch(first.id);
    assert.ok(full);
    assert.equal(full.id, first.id);
    assert.equal(full.topic, first.topic);
    assert.ok(Array.isArray(full.posts));
  });

  it('returns id when saving a topic fetch', async () => {
    const persistencePort = createSocialMediaFsAdapter({ dataDir });
    const fetchPort = createSocialMediaStubFetchAdapter({ persistencePort });
    const topic = createSocialMediaTopicFetchService({ persistencePort, fetchPort });

    const result = await topic.fetchByTopic({
      topic: 'test topic history',
      platforms: ['x'],
    });

    assert.ok(result.id);
    const loaded = await topic.getTopicFetch(result.id);
    assert.ok(loaded);
    assert.equal(loaded.topic, 'test topic history');
  });
});
