import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createApp } from '../../app.js';

let app;
let prevCwd;
let tmp;

beforeEach(async () => {
  // Create a sandboxed CWD so the createOverridesStore() default baseDir
  // (process.cwd()/reports/overrides) writes into a temp dir rather than
  // polluting the real reports/ directory.
  tmp = mkdtempSync(resolve(tmpdir(), 'overrides-api-'));
  prevCwd = process.cwd();
  process.chdir(tmp);

  app = await createApp({
    apiKey: 'test-key',
    fetchArticlesForDay: mock.fn(),
    timezone: 'Asia/Jerusalem',
    authRequired: false,
  });
});

afterEach(async () => {
  if (app) await app.close();
  process.chdir(prevCwd);
  rmSync(tmp, { recursive: true, force: true });
});

describe('POST /api/resilience/overrides', () => {
  it('returns 401 when authRequired but no user attached', async () => {
    // With authRequired=false, request.user is undefined; route requires uid in body.
    // Without uid in body either, expect 401.
    const res = await app.inject({
      method: 'POST',
      url: '/api/resilience/overrides',
      payload: { report_date: '2026-05-03', component_id: 'narrative',
        kind: 'challenge_score', proposed: { score: 5 } },
    });
    assert.equal(res.statusCode, 401);
  });

  it('creates a valid override (uid passed in body when authRequired=false)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/resilience/overrides',
      payload: {
        uid: 'test-uid',
        email: 't@example.com',
        report_date: '2026-05-03',
        scope: 'national',
        component_id: 'narrative',
        kind: 'challenge_score',
        proposed: { score: 4 },
        original: { score: 7 },
        note: 'evidence too thin',
      },
    });
    assert.equal(res.statusCode, 201, `unexpected: ${res.body}`);
    const body = JSON.parse(res.body);
    assert.ok(body.override?.id);
    assert.equal(body.override.uid, 'test-uid');
    assert.equal(body.override.proposed.score, 4);
    // file exists in sandboxed cwd
    assert.ok(existsSync(resolve(tmp, 'reports', 'overrides', '2026-05-03.jsonl')));
  });

  it('returns 400 with details on invalid payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/resilience/overrides',
      payload: { uid: 'u', report_date: 'bad', component_id: 'unknown',
        kind: 'challenge_score' },
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error, 'validation_failed');
    assert.ok(Array.isArray(body.details));
    assert.ok(body.details.includes('report_date_invalid'));
    assert.ok(body.details.includes('component_id_invalid'));
  });
});

describe('GET /api/resilience/overrides', () => {
  it('returns empty list when no records for date', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/resilience/overrides?date=2099-01-01',
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.count, 0);
    assert.deepEqual(body.overrides, []);
  });

  it('returns 400 on missing date', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/resilience/overrides',
    });
    assert.equal(res.statusCode, 400);
  });

  it('round-trips POST → GET', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/resilience/overrides',
      payload: { uid: 'u1', report_date: '2026-05-03', scope: 'national',
        component_id: 'leadership', kind: 'flag_signal', note: 'satirical' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/resilience/overrides?date=2026-05-03',
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.count, 1);
    assert.equal(body.overrides[0].component_id, 'leadership');
  });
});
