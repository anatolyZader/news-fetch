import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildXTopicQueries,
  SOCIAL_MEDIA_X_QUERY_OPTS,
  topicSlug,
  xThreeDayWindow,
} from '../../../../../business_modules/social_media/domain/services/xTopicQueryBuilder.js';

describe('xTopicQueryBuilder', () => {
  it('builds per-language queries without north locality on social media tab', () => {
    const queries = buildXTopicQueries('מקלטים', ['he', 'ar'], SOCIAL_MEDIA_X_QUERY_OPTS);
    assert.ok(queries.he.includes('מקלטים'));
    assert.ok(queries.he.includes('lang:he'));
    assert.doesNotMatch(queries.he, /נהריה|קריית שמונה/);
    assert.match(queries.he, /-is:retweet$/);
  });

  it('creates slug for non-ascii topics', () => {
    assert.match(topicSlug('מקלטים'), /^topic-[a-f0-9]{8}$/);
  });

  it('returns three dates in window', () => {
    const { dates } = xThreeDayWindow('2026-05-21');
    assert.equal(dates.length, 3);
    assert.equal(dates[0], '2026-05-21');
  });
});
