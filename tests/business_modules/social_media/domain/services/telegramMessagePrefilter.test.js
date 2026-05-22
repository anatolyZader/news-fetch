import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateToPost,
  messageToCandidate,
  prefilterTelegramMessages,
} from '../../../../../business_modules/social_media/domain/services/telegramMessagePrefilter.js';

describe('telegramMessagePrefilter', () => {
  const channel = {
    username: 'north_alerts',
    title: 'North Alerts',
    locality: 'נהריה',
    lang: 'he',
    sourceCategory: 'field_reports_aggregator',
    exampleSearchTerms: ['אזעקה'],
  };

  it('messageToCandidate builds URL and skips very short text', () => {
    assert.equal(messageToCandidate({ id: 1, message: 'short', date: 1 }, channel, { date: '2026-05-22' }), null);

    const candidate = messageToCandidate({
      id: 99,
      message: 'אזעקה בנהריה — תושבים נכנסים למקלט',
      date: 1710000000,
      views: 50,
    }, channel, { date: '2026-05-22' });

    assert.ok(candidate);
    assert.equal(candidate.url, 'https://t.me/north_alerts/99');
    assert.equal(candidate.locality, 'נהריה');
    assert.equal(candidate.sourceCategory, 'field_reports_aggregator');
  });

  it('does not skip messages from news-named or official channels', () => {
    const newsChannel = {
      ...channel,
      title: 'חדשות 360',
      username: 'newsil360',
      sourceCategory: 'official_municipal_updates',
    };
    const out = prefilterTelegramMessages([
      { id: 1, message: 'אזעקה בקריית שמונה — היכנסו למרחב המוגן', date: 1 },
    ], newsChannel, { date: '2026-05-22' });
    assert.equal(out.length, 1);
  });

  it('skips only when collectEnabled is explicitly false', () => {
    const disabled = { ...channel, collectEnabled: false };
    const out = prefilterTelegramMessages([
      { id: 1, message: 'Long enough message for testing prefilter', date: 1 },
    ], disabled, { date: '2026-05-22' });
    assert.equal(out.length, 0);
  });

  it('candidateToPost includes research metadata', () => {
    const candidate = {
      messageId: '99',
      username: 'north_alerts',
      channelTitle: 'North Alerts',
      locality: 'נהריה',
      text: 'אזעקה בנהריה',
      postedAt: '2026-05-22T10:00:00.000Z',
      url: 'https://t.me/north_alerts/99',
      lang: 'he',
      views: 10,
      date: '2026-05-22',
      sourceCategory: 'field_reports_aggregator',
      citizenVoiceLevel: 'medium',
      accessStatus: 'public web preview found',
    };

    const post = candidateToPost(candidate, 'נהריה');
    assert.equal(post.platform, 'telegram_public');
    assert.equal(post.meta.sourceCategory, 'field_reports_aggregator');
    assert.equal(post.meta.citizenVoiceLevel, 'medium');
  });
});
