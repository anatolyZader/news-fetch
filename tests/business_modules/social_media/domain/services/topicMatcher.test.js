import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTopicConcept,
  conceptSearchTermsForLang,
} from '../../../../../business_modules/social_media/domain/services/topicConceptNormalizer.js';
import { postMatchesTopic } from '../../../../../business_modules/social_media/domain/services/topicMatcher.js';
import { buildXTopicQueries, SOCIAL_MEDIA_X_LANGS, SOCIAL_MEDIA_X_QUERY_OPTS } from '../../../../../business_modules/social_media/domain/services/xTopicQueryBuilder.js';

describe('topicConceptNormalizer', () => {
  it('expands English uav danger to Hebrew drone and threat terms', () => {
    const n = normalizeTopicConcept('uav danger');
    assert.ok(n.conceptIds.includes('uav_drone'));
    assert.ok(n.conceptIds.includes('danger_threat'));
    assert.ok(n.matchTokens.some((t) => t.includes('רחפן') || t.includes('כטב')));
    assert.ok(n.matchTokens.some((t) => t.includes('סכנה') || t.includes('איום') || t.includes('פחד')));
  });

  it('matches Hebrew posts when UI topic is English', () => {
    assert.ok(postMatchesTopic(
      { text: 'תושבים מדווחים על רחפן מעל נהריה — חשש מסכנה' },
      'uav danger',
    ));
  });

  it('provides per-language X search terms from English input', () => {
    const heTerms = conceptSearchTermsForLang('uav danger', 'he');
    assert.ok(heTerms.some((t) => /רחפן|כטב/.test(t)));
    const enTerms = conceptSearchTermsForLang('uav danger', 'en');
    assert.ok(enTerms.some((t) => /uav|drone/i.test(t)));
  });
});

describe('topicMatcher', () => {
  it('drops English stop words from match tokens', () => {
    const n = normalizeTopicConcept("ben gvir's visit to ashdod");
    assert.ok(n.matchTokens.includes('ashdod'));
    assert.ok(n.matchTokens.includes('gvir'));
    assert.equal(n.matchTokens.includes('to'), false);
  });

  it('matches posts containing topic terms', () => {
    assert.ok(postMatchesTopic({ text: 'בן גביר ביקר באשדוד היום' }, "ben gvir's visit to ashdod"));
    assert.equal(postMatchesTopic({ text: 'TWICE tour in the Middle East' }, "ben gvir's visit to ashdod"), false);
  });

  it('rejects military news that only matches danger modifier for uav danger', () => {
    const military = 'פרטים חדשים על חיסול המחבלים — בצה"ל עלה חשש שהמחבלים שרדו. בצה"ל הכריזו על חזרה לשגרה.';
    assert.equal(postMatchesTopic({ text: military }, 'uav danger'), false);
  });

  it('accepts uav danger when drone terms are present', () => {
    assert.ok(postMatchesTopic({ text: 'רחפן מזויין מעל מטולה — תושבים מדווחים על חשש' }, 'uav danger'));
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

  it('expands uav topic with Hebrew drone and threat terms', () => {
    const queries = buildXTopicQueries('uav danger', ['he'], SOCIAL_MEDIA_X_QUERY_OPTS);
    assert.match(queries.he, /כטב"מ|רחפן/);
    assert.match(queries.he, /סכנה|איום|פחד/);
    assert.doesNotMatch(queries.he, /נהריה|קריית שמונה/);
  });
});
