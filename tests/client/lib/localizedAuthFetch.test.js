import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withLang } from '../../client/src/lib/localeFetch.js';

describe('withLang', () => {
  it('appends lang query for non-english', () => {
    assert.equal(withLang('/api/pbo/municipal-reviews?date=2026-01-01', 'he'), '/api/pbo/municipal-reviews?date=2026-01-01&lang=he');
  });

  it('leaves english URLs unchanged', () => {
    assert.equal(withLang('/api/news-sites/daily?date=2026-01-01', 'en'), '/api/news-sites/daily?date=2026-01-01');
  });
});

describe('localized API path coverage', () => {
  const LOCALIZED_PREFIXES = [
    '/api/pbo/municipal-reviews',
    '/api/pbo/historical-search',
    '/api/social-media/report',
    '/api/social-media/daily',
    '/api/news-sites/daily',
    '/api/radio/daily',
    '/api/municipalities',
    '/api/visits',
    '/api/docs/',
    '/api/validation/',
  ];

  it('withLang covers all localized route prefixes used by hooks', () => {
    for (const prefix of LOCALIZED_PREFIXES) {
      const url = `${prefix}?x=1`;
      const localized = withLang(url, 'ru');
      assert.match(localized, /lang=ru/, `expected lang param for ${prefix}`);
    }
  });
});
