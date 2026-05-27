import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../app.js';

test('GET /api/news-sites returns dashboard with dated exports', async () => {
  process.env.AUTH_REQUIRED = 'false';
  const app = await createApp({
    apiKey: process.env.NEWSAPI_API_KEY || 'test-key',
    fetchArticlesForDay: async () => [],
    authRequired: false,
  });

  const res = await app.inject({ method: 'GET', url: '/api/news-sites' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.dates));
  assert.ok(body.dates.length > 0);
  assert.equal(typeof body.summary.totalDays, 'number');
});

test('GET /api/news-sites/daily returns articles for a known date', async () => {
  process.env.AUTH_REQUIRED = 'false';
  const app = await createApp({
    apiKey: process.env.NEWSAPI_API_KEY || 'test-key',
    fetchArticlesForDay: async () => [],
    authRequired: false,
  });

  const dash = await app.inject({ method: 'GET', url: '/api/news-sites' });
  const date = dash.json().dates[0].date;
  const res = await app.inject({ method: 'GET', url: `/api/news-sites/daily?date=${date}` });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.date, date);
  assert.ok(Array.isArray(body.articles));
  assert.ok(body.articles.length > 0);
});

test('GET /api/radio returns dashboard', async () => {
  process.env.AUTH_REQUIRED = 'false';
  const app = await createApp({
    apiKey: process.env.NEWSAPI_API_KEY || 'test-key',
    fetchArticlesForDay: async () => [],
    authRequired: false,
  });

  const res = await app.inject({ method: 'GET', url: '/api/radio' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.dates));
  assert.equal(typeof body.enabled, 'boolean');
});
