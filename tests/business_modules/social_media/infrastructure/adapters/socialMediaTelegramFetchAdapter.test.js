import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSocialMediaFsAdapter } from '../../../../../business_modules/social_media/infrastructure/adapters/socialMediaFsAdapter.js';
import { createSocialMediaTelegramFetchAdapter } from '../../../../../business_modules/social_media/infrastructure/adapters/socialMediaTelegramFetchAdapter.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const dataDir = resolve(repoRoot, 'business_modules/social_media/data');

    const MOCK_CHANNELS = [{
      username: 'north_alerts',
      locality: 'נהריה',
      lang: 'he',
      sourceCategory: 'field_reports_aggregator',
      citizenVoiceLevel: 'medium',
    }];

describe('socialMediaTelegramFetchAdapter', () => {
  it('dry-run returns channel list without MTProto calls', async () => {
    const persistencePort = createSocialMediaFsAdapter({ dataDir });
    let historyCalls = 0;
    const telegramClient = {
      async getChannelHistory() {
        historyCalls += 1;
        return [];
      },
      async delayBetweenChannels() {},
    };

    const adapter = createSocialMediaTelegramFetchAdapter({
      telegramClient,
      persistencePort,
      dataDir,
      loadChannels: () => MOCK_CHANNELS,
    });

    const result = await adapter.fetchByTopic({ topic: 'מקלטים', execute: false });

    assert.equal(result.mode, 'dry_run');
    assert.equal(result.posts.length, 0);
    assert.equal(historyCalls, 0);
    assert.ok(result.dryRun?.channels?.includes('north_alerts'));
  });

  it('execute filters out pure alerts without population behavior', async () => {
    const persistencePort = createSocialMediaFsAdapter({ dataDir });
    const telegramClient = {
      async getChannelHistory() {
        return [
          {
            id: 1,
            message: 'אזעקה בגליל המערבי',
            date: Math.floor(Date.now() / 1000) - 3600,
          },
          {
            id: 2,
            message: 'אזעקה בנהריה — תושבים נכנסים למקלט',
            date: Math.floor(Date.now() / 1000) - 3500,
          },
        ];
      },
      async delayBetweenChannels() {},
    };

    const adapter = createSocialMediaTelegramFetchAdapter({
      telegramClient,
      persistencePort,
      dataDir,
      loadChannels: () => [{
        username: 'muninahariya',
        locality: 'נהריה',
        sourceCategory: 'official_municipal_updates',
        citizenVoiceLevel: 'low',
      }],
    });

    const result = await adapter.fetchByTopic({ topic: 'נהריה', execute: true });
    assert.equal(result.posts.length, 1);
    assert.ok(result.posts[0].text.includes('תושבים'));
    assert.equal(result.posts[0].meta.homefrontBehaviorEvidence, true);
  });

  it('execute fetches and filters by topic', async () => {
    const persistencePort = createSocialMediaFsAdapter({ dataDir });
    const telegramClient = {
      async getChannelHistory({ username }) {
        if (username === 'north_alerts') {
          return [{
            id: 42,
            message: 'אזעקה בנהריה — תושבים נכנסים למקלט',
            date: Math.floor(Date.now() / 1000) - 3600,
            views: 100,
          }];
        }
        return [];
      },
      async delayBetweenChannels() {},
    };

    const adapter = createSocialMediaTelegramFetchAdapter({
      telegramClient,
      persistencePort,
      dataDir,
      loadChannels: () => MOCK_CHANNELS,
    });

    const result = await adapter.fetchByTopic({ topic: 'נהריה', execute: true });

    assert.equal(result.mode, 'execute');
    assert.equal(result.source, 'telegram_mtproto');
    assert.ok(result.posts.length >= 1);
    assert.equal(result.posts[0].platform, 'telegram_public');
    assert.ok(result.posts[0].url.includes('t.me/north_alerts/42'));
  });

  it('fetchDailyEvidence does not require topic match', async () => {
    const persistencePort = createSocialMediaFsAdapter({ dataDir });
    const telegramClient = {
      async getChannelHistory() {
        return [{
          id: 99,
          message: 'תושבים בנהריה מדווחים על פחד ונכנסים למקלט',
          date: Math.floor(Date.now() / 1000) - 3600,
        }];
      },
      async delayBetweenChannels() {},
    };

    const adapter = createSocialMediaTelegramFetchAdapter({
      telegramClient,
      persistencePort,
      dataDir,
      loadChannels: () => MOCK_CHANNELS,
    });

    const result = await adapter.fetchDailyEvidence({
      execute: true,
      north: true,
      anchorDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }),
      days: 1,
    });

    assert.equal(result.mode, 'execute');
    assert.equal(result.source, 'telegram_mtproto_daily');
    assert.ok(result.posts.length >= 1);
    assert.equal(result.posts[0].platform, 'telegram_public');
  });

  it('returns unconfigured when channel registry is empty', async () => {
    const persistencePort = createSocialMediaFsAdapter({ dataDir });
    const adapter = createSocialMediaTelegramFetchAdapter({
      telegramClient: { async getChannelHistory() { return []; } },
      persistencePort,
      dataDir,
      loadChannels: () => [],
    });

    const result = await adapter.fetchByTopic({ topic: 'test', execute: true });
    assert.equal(result.source, 'telegram_unconfigured');
    assert.equal(result.posts.length, 0);
  });
});
