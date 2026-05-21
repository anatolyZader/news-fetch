import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  meaningfulTopicTokens,
  postMatchesTopic,
  topicMatchTokens,
} from '../../../../../business_modules/social_media/domain/services/topicMatcher.js';
import { buildXTopicQueries, SOCIAL_MEDIA_X_LANGS, SOCIAL_MEDIA_X_QUERY_OPTS } from '../../../../../business_modules/social_media/domain/services/xTopicQueryBuilder.js';

describe('topicMatcher', () => {
  it('drops English stop words from match tokens', () => {
    const tokens = topicMatchTokens("ben gvir's visit to ashdod");
    assert.ok(tokens.includes('ashdod'));
    assert.ok(tokens.includes('gvir'));
    assert.equal(tokens.includes('to'), false);
  });

  it('matches posts containing topic terms', () => {
    assert.ok(postMatchesTopic({ text: 'בן גביר ביקר באשדוד היום' }, "ben gvir's visit to ashdod"));
    assert.equal(postMatchesTopic({ text: 'TWICE tour in the Middle East' }, "ben gvir's visit to ashdod"), false);
  });
});

describe('xTopicQueryBuilder', () => {
  it('omits lang: operators on social media tab (X API returns empty with lang:he)', () => {
    const queries = buildXTopicQueries("ben gvir's visit to Ashdod port", SOCIAL_MEDIA_X_LANGS, SOCIAL_MEDIA_X_QUERY_OPTS);
    assert.doesNotMatch(queries.he, /lang:he/);
    assert.doesNotMatch(queries.en, /lang:en/);
    assert.match(queries.he, /בן גביר/);
    assert.match(queries.he, /אשדוד/);
  });

  it('expands uav topic with Hebrew drone terms', () => {
    const queries = buildXTopicQueries('uav danger', ['he'], SOCIAL_MEDIA_X_QUERY_OPTS);
    assert.match(queries.he, /כטב"מ|רחפן/);
    assert.doesNotMatch(queries.he, /נהריה|קריית שמונה/);
  });
});
