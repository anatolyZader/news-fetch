import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../app.js';

process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), 'tour-routes-')), 'test.sqlite');

async function buildApp() {
  return createApp({
    apiKey: 'test-key',
    fetchArticlesForDay: mock.fn(),
    timezone: 'Asia/Jerusalem',
    authRequired: false,
  });
}

test('tour progress: default null, PUT/GET roundtrip, validation', async () => {
  const app = await buildApp();

  let res = await app.inject({ method: 'GET', url: '/api/tour/progress?tourId=main-shell' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { tourId: 'main-shell', progress: null });

  res = await app.inject({
    method: 'PUT',
    url: '/api/tour/progress',
    payload: { tourId: 'main-shell', status: 'in_progress', lastStepIndex: 3, seenVersion: 1 },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).progress.lastStepIndex, 3);

  res = await app.inject({ method: 'GET', url: '/api/tour/progress?tourId=main-shell' });
  const body = JSON.parse(res.body);
  assert.equal(body.progress.status, 'in_progress');
  assert.equal(body.progress.seenVersion, 1);

  res = await app.inject({
    method: 'PUT',
    url: '/api/tour/progress',
    payload: { tourId: 'main-shell', status: 'completed', lastStepIndex: 9, seenVersion: 1 },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(JSON.parse(res.body).progress.completedAt);

  res = await app.inject({ method: 'GET', url: '/api/tour/progress?tourId=unknown' });
  assert.equal(res.statusCode, 400);

  res = await app.inject({ method: 'GET', url: '/api/tour/progress' });
  assert.equal(res.statusCode, 400, 'missing tourId rejected');

  res = await app.inject({
    method: 'PUT',
    url: '/api/tour/progress',
    payload: { tourId: 'main-shell', status: 'bogus' },
  });
  assert.equal(res.statusCode, 400);

  res = await app.inject({
    method: 'PUT',
    url: '/api/tour/progress',
    payload: { tourId: 'main-shell', status: 'in_progress', lastStepIndex: 2.5 },
  });
  assert.equal(res.statusCode, 400, 'non-integer step index rejected');

  res = await app.inject({
    method: 'PUT',
    url: '/api/tour/progress',
    payload: { tourId: 'main-shell', status: 'in_progress', seenVersion: 0 },
  });
  assert.equal(res.statusCode, 400, 'seenVersion below 1 rejected');
});
