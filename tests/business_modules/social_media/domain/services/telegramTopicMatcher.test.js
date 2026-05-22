import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { telegramPostMatchesTopic } from '../../../../../business_modules/social_media/domain/services/telegramTopicMatcher.js';

describe('telegramTopicMatcher', () => {
  const channel = {
    username: 'muninahariya',
    locality: 'נהריה',
    coverageArea: ['נהריה', 'גליל מערבי'],
    exampleSearchTerms: ['אזעקה', 'מקלט', 'כטבם'],
  };

  it('matches standard topic tokens in post text', () => {
    const post = { text: 'אזעקה בנהריה', location: 'נהריה' };
    assert.ok(telegramPostMatchesTopic(post, 'נהריה', channel));
  });

  it('matches via channel example_search_terms when topic overlaps', () => {
    const post = { text: 'חדירת כלי טיס — היכנסו למקלט מיד', location: 'נהריה' };
    assert.ok(telegramPostMatchesTopic(post, 'מקלט', channel));
  });

  it('matches coverage area overlap for locality topics', () => {
    const post = { text: 'עדכון מגליל מערבי: תושבים מתבקשים להיכנס למרחב מוגן', location: 'נהריה' };
    assert.ok(telegramPostMatchesTopic(post, 'נהריה', channel));
  });

  it('does not match unrelated posts', () => {
    const post = { text: 'מבצע שוקולד בבית קafe', location: 'נהריה' };
    assert.equal(telegramPostMatchesTopic(post, 'רחפן', channel), false);
  });
});
