/**
 * Unit tests for GET /articles per docs/specs/ynet-articles-api.md
 * All I/O, edge, and error variants from the spec.
 */
import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../app.js';

describe('GET /api/auth/config', () => {
  it('returns authRequired false by default (no AUTH_REQUIRED in test env)', async () => {
    const app = await createApp({
      apiKey: 'test-key',
      fetchArticlesForDay: mock.fn(),
      timezone: 'Asia/Jerusalem',
    });
    const res = await app.inject({ method: 'GET', url: '/api/auth/config' });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.authRequired, false);
  });
});

describe('GET /articles', () => {
  let fetchArticlesForDay;

  beforeEach(() => {
    fetchArticlesForDay = mock.fn();
  });

  async function getArticles(query = {}) {
    const app = await createApp({
      apiKey: 'test-key',
      fetchArticlesForDay,
      timezone: 'Asia/Jerusalem',
    });
    const qs = new URLSearchParams(query).toString();
    const res = await app.inject({
      method: 'GET',
      url: `/articles${qs ? `?${qs}` : ''}`,
    });
    return res;
  }

  describe('success (200)', () => {
    it('returns JSON array of articles with title, url, published date, source', async () => {
      const articles = [
        {
          title: 'כותרת 1',
          url: 'https://ynet.co.il/1',
          publishedAt: '2025-01-15T10:00:00.000Z',
          source: 'ynet.co.il',
        },
        {
          title: 'כותרת 2',
          url: 'https://ynet.co.il/2',
          publishedAt: '2025-01-15T14:30:00.000Z',
          source: 'ynet.co.il',
        },
      ];
      fetchArticlesForDay.mock.mockImplementationOnce(async () => articles);

      const res = await getArticles();

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert(Array.isArray(body));
      assert.strictEqual(body.length, 2);
      assert.strictEqual(body[0].title, 'כותרת 1');
      assert.strictEqual(body[0].url, 'https://ynet.co.il/1');
      assert.strictEqual(body[0].publishedAt, '2025-01-15T10:00:00.000Z');
      assert.strictEqual(body[0].source, 'ynet.co.il');
      assert.strictEqual(body[1].title, 'כותרת 2');
    });

    it('uses today when date query is omitted', async () => {
      fetchArticlesForDay.mock.mockImplementationOnce(async () => []);

      const res = await getArticles();

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(fetchArticlesForDay.mock.calls.length, 1);
      const [arg] = fetchArticlesForDay.mock.calls[0].arguments;
      assert(arg.date);
      assert.match(arg.date, /^\d{4}-\d{2}-\d{2}$/);
    });

    it('passes date YYYY-MM-DD to fetchArticlesForDay when provided', async () => {
      fetchArticlesForDay.mock.mockImplementationOnce(async () => []);

      const res = await getArticles({ date: '2025-01-15' });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(fetchArticlesForDay.mock.calls.length, 1);
      assert.strictEqual(fetchArticlesForDay.mock.calls[0].arguments[0].date, '2025-01-15');
    });

    it('returns empty array when no articles for the day (empty day)', async () => {
      fetchArticlesForDay.mock.mockImplementationOnce(async () => []);

      const res = await getArticles({ date: '2025-01-15' });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.deepStrictEqual(body, []);
    });
  });

  describe('400 Bad Request – invalid date', () => {
    it('returns 400 when date format is malformed', async () => {
      const res = await getArticles({ date: 'not-a-date' });

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(fetchArticlesForDay.mock.calls.length, 0);
    });

    it('returns 400 when date is invalid (e.g. 2025-13-45)', async () => {
      const res = await getArticles({ date: '2025-13-45' });

      assert.strictEqual(res.statusCode, 400);
    });

    it('returns 400 when date is future (after today)', async () => {
      const res = await getArticles({ date: '2030-01-01' });

      assert.strictEqual(res.statusCode, 400);
    });
  });

  describe('502/503 – NewsAPI.ai unavailable or error', () => {
    it('returns 502 when fetchArticlesForDay throws', async () => {
      fetchArticlesForDay.mock.mockImplementationOnce(async () => {
        throw new Error('Network error');
      });

      const res = await getArticles({ date: '2025-01-15' });

      assert.ok(res.statusCode === 502 || res.statusCode === 503);
    });

    it('returns 502 or 503 when upstream returns error', async () => {
      fetchArticlesForDay.mock.mockImplementationOnce(async () => {
        const err = new Error('Upstream error');
        err.upstream = true;
        throw err;
      });

      const res = await getArticles();

      assert.ok(res.statusCode === 502 || res.statusCode === 503);
    });
  });

  describe('missing API key', () => {
    it('createApp throws or returns 503 when apiKey is missing', async () => {
      try {
        const app = await createApp({
          apiKey: '',
          fetchArticlesForDay,
          timezone: 'Asia/Jerusalem',
        });
        const res = await app.inject({ method: 'GET', url: '/articles' });
        assert.ok(res.statusCode === 503 || res.statusCode === 400, 'expected 503 or 400 when key missing');
      } catch (e) {
        assert.ok(e.message.includes('apiKey') || e.message.includes('API key'), 'expected fail-fast on missing key');
      }
    });
  });
});
