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

  it('translates posts to the requested UI language', async () => {
    const persistencePort = createSocialMediaFsAdapter({ dataDir });
    const fetchPort = {
      async fetchByTopic() {
        return {
          posts: [{
            id: 'p1',
            platform: 'x',
            text: 'טקסט בעברית',
            dedupeKey: 'p1',
          }],
          source: 'test',
          accessNotes: [],
        };
      },
    };
    let translateCalls = 0;
    const translatePosts = async (posts, lang) => {
      translateCalls += 1;
      return posts.map((p) => ({ ...p, text: `[${lang}] ${p.text}`, translatedTo: lang }));
    };
    const topic = createSocialMediaTopicFetchService({ persistencePort, fetchPort, translatePosts });

    const result = await topic.fetchByTopic({
      topic: 'test topic',
      platforms: ['x'],
      lang: 'en',
    });

    assert.equal(translateCalls, 1);
    assert.equal(result.lang, 'en');
    assert.match(result.posts[0].text, /^\[en\] /);
  });

  it('re-translates saved topic fetch when lang query differs', async () => {
    const persistencePort = createSocialMediaFsAdapter({ dataDir });
    const fetchPort = {
      async fetchByTopic() {
        return {
          posts: [{
            id: 'p1',
            platform: 'x',
            text: 'טקסט בעברית',
            dedupeKey: 'p1',
          }],
          source: 'test',
          accessNotes: [],
        };
      },
    };
    const translatePosts = async (posts, lang) => posts.map((p) => ({
      ...p,
      textOriginal: p.textOriginal ?? p.text,
      text: `[${lang}] ${p.textOriginal ?? p.text}`,
      translatedTo: lang,
    }));
    const topic = createSocialMediaTopicFetchService({ persistencePort, fetchPort, translatePosts });

    const saved = await topic.fetchByTopic({
      topic: 'test topic retranslate',
      platforms: ['x'],
      lang: 'he',
    });
    assert.ok(saved.id);
    const loaded = await topic.getTopicFetch(saved.id, { lang: 'ru' });
    assert.equal(loaded.lang, 'ru');
    assert.match(loaded.posts[0].text, /^\[ru\] /);
  });
});
