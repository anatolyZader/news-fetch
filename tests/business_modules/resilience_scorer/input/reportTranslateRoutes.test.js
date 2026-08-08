import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'os';
import { reportRoutes } from '../../../../business_modules/resilience_scorer/input/reportRoutes.js';

async function testAuthPreHandler(request) {
  request.user = { uid: 'u1', email: 'user@test.com' };
}

function miniCachedPayload(date, synthesis = 'English synthesis.') {
  return {
    assessment: {
      date,
      report_scope: { id: 'national' },
      total_articles_analyzed: 10,
      cross_component_synthesis: synthesis,
      components: [{ component_id: 'narrative', narrative: 'Component narrative.' }],
    },
    score_by_source: { press: { score: 5 } },
  };
}

describe('reportRoutes POST /api/translate', () => {
  /** @type {import('fastify').FastifyInstance} */
  let app;
  /** @type {string} */
  let reportsDir;
  let prevTranslationEnabled;

  beforeEach(async () => {
    prevTranslationEnabled = process.env.TRANSLATION_ENABLED;
    reportsDir = mkdtempSync(join(tmpdir(), 'translate-route-'));
    process.env.REPORTS_DIR = reportsDir;

    const date = '2099-01-15';
    writeFileSync(
      join(reportsDir, `resilience-report-data-${date}-run-1000.json`),
      JSON.stringify(miniCachedPayload(date)),
      'utf8',
    );

    app = Fastify();
    await reportRoutes(app, {
      authHook: { preHandler: testAuthPreHandler },
      readAuthHook: { preHandler: testAuthPreHandler },
      evidenceStore: null,
      timezone: 'Asia/Jerusalem',
      fetchArticlesForDay: async () => [],
    });
  });

  afterEach(async () => {
    if (prevTranslationEnabled === undefined) delete process.env.TRANSLATION_ENABLED;
    else process.env.TRANSLATION_ENABLED = prevTranslationEnabled;
    delete process.env.REPORTS_DIR;
    await app.close();
    rmSync(reportsDir, { recursive: true, force: true });
  });

  it('returns untranslated report when TRANSLATION_ENABLED is not true', async () => {
    delete process.env.TRANSLATION_ENABLED;
    const res = await app.inject({
      method: 'POST',
      url: '/api/translate',
      payload: { date: '2099-01-15', scope: 'national', lang: 'he' },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.report.cross_component_synthesis, 'English synthesis.');
  });

  it('loads report by date and scope without client report body', async () => {
    delete process.env.TRANSLATION_ENABLED;
    const res = await app.inject({
      method: 'POST',
      url: '/api/translate',
      payload: { date: '2099-01-15', lang: 'ru' },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().report.date, '2099-01-15');
  });

  it('returns 404 when date has no cached report', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/translate',
      payload: { date: '1999-01-01', lang: 'he' },
    });
    assert.equal(res.statusCode, 404);
  });

  it('returns 400 when neither report nor date is provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/translate',
      payload: { lang: 'he' },
    });
    assert.equal(res.statusCode, 400);
  });

  it('still accepts legacy full report body', async () => {
    delete process.env.TRANSLATION_ENABLED;
    const report = miniCachedPayload('2099-01-15').assessment;
    const res = await app.inject({
      method: 'POST',
      url: '/api/translate',
      payload: { report, lang: 'he' },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().report.cross_component_synthesis, 'English synthesis.');
  });
});
