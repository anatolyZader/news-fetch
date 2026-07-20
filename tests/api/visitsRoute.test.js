import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createApp } from '../../app.js';

test('GET /api/visits returns the visits dashboard', async () => {
  const app = await createApp({
    apiKey: 'test-key',
    fetchArticlesForDay: mock.fn(),
    timezone: 'Asia/Jerusalem',
    authRequired: false,
  });

  const res = await app.inject({ method: 'GET', url: '/api/visits' });
  const body = JSON.parse(res.body);

  assert.equal(res.statusCode, 200);
  assert.ok(body.summary);
  assert.ok(Array.isArray(body.days));
  assert.equal(body.summary.storage.rawPattern, 'business_modules/visits/data/articles-visits-reports-YYYY-MM-DD.md');
  assert.equal(
    body.summary.storage.signalsPattern,
    'business_modules/visits/data/signals/signals-visits-YYYY-MM-DD.json',
  );
});
