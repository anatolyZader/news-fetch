import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadTelegramChannels,
  parseTelegramChannelRegistry,
} from '../../../../../business_modules/social_media/domain/services/telegramChannelRegistry.js';

describe('telegramChannelRegistry', () => {
  it('loads and normalizes legacy flat array entries', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tg-ch-'));
    writeFileSync(join(dir, 'telegram-public-channels.json'), JSON.stringify([
      { username: '@my_channel', locality: 'נהריה', lang: 'he' },
      { username: '', enabled: true },
      { username: 'disabled', enabled: false },
    ]));

    const channels = loadTelegramChannels(dir);
    assert.equal(channels.length, 1);
    assert.equal(channels[0].username, 'my_channel');
    assert.equal(channels[0].locality, 'נהריה');
  });

  it('loads research sources[] format with field mapping', () => {
    const parsed = {
      sources: [
        {
          id: 'telegram_nahariya_municipality',
          display_name: 'עיריית נהריה אונליין',
          telegram_handle: 'muninahariya',
          source_category: 'official_municipal_updates',
          coverage_area: ['נהריה', 'גליל מערבי'],
          language: ['he'],
          priority: 1,
          citizen_voice_level: 'low',
          example_search_terms: ['אזעקה', 'מקלט'],
          access_status: 'public web preview found',
        },
        {
          id: 'skip_me',
          telegram_handle: 'skip_channel',
          enabled: false,
        },
        {
          id: 'candidate',
          telegram_handle: 'ravarava1233',
          display_name: 'רבש״צים',
          coverage_area: ['ישראל', 'מטולה'],
          access_status: 'candidate discovered via public directory; verify before use',
          priority: 3,
        },
      ],
    };

    const channels = parseTelegramChannelRegistry(parsed);
    assert.equal(channels.length, 2);
    assert.equal(channels[0].username, 'muninahariya');
    assert.equal(channels[0].title, 'עיריית נהריה אונליין');
    assert.equal(channels[0].locality, 'נהריה');
    assert.equal(channels[0].lang, 'he');
    assert.equal(channels[0].sourceCategory, 'official_municipal_updates');
    assert.equal(channels[0].citizenVoiceLevel, 'low');
    assert.deepEqual(channels[0].exampleSearchTerms, ['אזעקה', 'מקלט']);

    const candidate = channels.find((c) => c.username === 'ravarava1233');
    assert.ok(candidate);
    assert.match(candidate.accessStatus ?? '', /candidate/);
    assert.equal(candidate.locality, 'מטולה');
  });

  it('sorts channels by priority ascending', () => {
    const channels = parseTelegramChannelRegistry({
      sources: [
        { telegram_handle: 'low_prio', priority: 4 },
        { telegram_handle: 'high_prio', priority: 1 },
      ],
    });
    assert.deepEqual(channels.map((c) => c.username), ['high_prio', 'low_prio']);
  });

  it('returns empty array when file missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tg-ch-empty-'));
    assert.deepEqual(loadTelegramChannels(dir), []);
  });
});
