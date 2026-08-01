import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { updateOperatorRecommendationStatus } from '../../../../business_modules/resilience_scorer/infrastructure/recommendationStatusWriter.js';
import { resetReportFileCacheForTests } from '../../../../business_modules/resilience_scorer/infrastructure/reportFileCache.js';

const dir = mkdtempSync(join(tmpdir(), 'recstatus-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const DATE = '2026-07-30';
const FILE = join(dir, 'national-1-300726-1200.json');

function seedReport() {
  writeFileSync(FILE, JSON.stringify({
    generated_at: `${DATE}T12:00:00.000Z`,
    assessment: {
      date: DATE,
      total_articles_analyzed: 5,
      operator_recommendations: [
        { id: 'rec-1', status: 'open' },
        { id: 'rec-2', status: 'open' },
      ],
    },
  }, null, 2));
}

beforeEach(() => {
  seedReport();
  resetReportFileCacheForTests();
});

describe('updateOperatorRecommendationStatus', () => {
  it('acknowledges a recommendation', async () => {
    const result = await updateOperatorRecommendationStatus(
      DATE, 'national', 'rec-1',
      { action: 'acknowledge', userEmail: 'op@example.com', rationale: 'done' },
      { reportsDir: dir },
    );
    assert.equal(result.ok, true);
    assert.equal(result.recommendation.status, 'acknowledged');
    const onDisk = JSON.parse(readFileSync(FILE, 'utf8'));
    assert.equal(onDisk.assessment.operator_recommendations[0].status, 'acknowledged');
  });

  it('does not lose updates under concurrent acknowledges', async () => {
    const [a, b] = await Promise.all([
      updateOperatorRecommendationStatus(
        DATE, 'national', 'rec-1', { action: 'acknowledge' }, { reportsDir: dir },
      ),
      updateOperatorRecommendationStatus(
        DATE, 'national', 'rec-2', { action: 'dismiss', rationale: 'n/a' }, { reportsDir: dir },
      ),
    ]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    const onDisk = JSON.parse(readFileSync(FILE, 'utf8'));
    const byId = Object.fromEntries(
      onDisk.assessment.operator_recommendations.map((r) => [r.id, r.status]),
    );
    assert.equal(byId['rec-1'], 'acknowledged');
    assert.equal(byId['rec-2'], 'dismissed');
  });

  it('returns not-found errors', async () => {
    const missing = await updateOperatorRecommendationStatus(
      DATE, 'national', 'nope', { action: 'acknowledge' }, { reportsDir: dir },
    );
    assert.deepEqual(missing, { ok: false, error: 'recommendation_not_found' });
    const noReport = await updateOperatorRecommendationStatus(
      '1999-01-01', 'national', 'rec-1', { action: 'acknowledge' }, { reportsDir: dir },
    );
    assert.deepEqual(noReport, { ok: false, error: 'report_not_found' });
  });
});
