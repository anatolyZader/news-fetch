/**
 * Integration test: verifies the API works with real NewsAPI.ai and returns a list of articles.
 * Loads NEWSAPI_API_KEY from .env; skipped when not set (e.g. in CI without secrets).
 */
import 'dotenv/config';
import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../app.js';
import { createNewsApiArticlesFetcher } from '../business_modules/news-sites/infrastructure/adapters/newsApiYnetAdapter.js';

const apiKey = (process.env.NEWSAPI_AI_KEY || process.env.NEWSAPI_API_KEY || process.env.NEWSAPI_KEY || '').trim();

describe('GET /articles (integration)', () => {
  let app;

  before(async () => {
    if (!apiKey) return;
    const fetchArticlesForDay = createNewsApiArticlesFetcher({
      apiKey,
      timezone: 'Asia/Jerusalem',
    });
    app = await createApp({
      apiKey,
      fetchArticlesForDay,
      timezone: 'Asia/Jerusalem',
      authRequired: false,
    });
  });

  it('returns 200 and a list of articles from ynet.co.il for a given day', async () => {
    if (!apiKey) {
      console.log('Skipping: NEWSAPI_API_KEY not set');
      return;
    }

    const pastDate = '2025-01-10';
    const res = await app.inject({
      method: 'GET',
      url: `/articles?date=${pastDate}`,
    });

    assert.strictEqual(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${res.body}`);

    const body = JSON.parse(res.body);
    assert(Array.isArray(body), 'response body must be an array');

    for (const article of body) {
      assert(typeof article.title === 'string', 'each article must have title');
      assert(typeof article.url === 'string', 'each article must have url');
      assert(typeof article.publishedAt === 'string', 'each article must have publishedAt');
      assert(typeof article.source === 'string', 'each article must have source');
    }

    if (body.length > 0) {
      assert.ok(body.some((a) => (a.source || '').includes('ynet')), 'articles should be from ynet when present');
    }
  });
});
