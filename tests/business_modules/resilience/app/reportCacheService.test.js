import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { resolveReportJsonPathForDate } from '../../../../business_modules/resilience/index.js';

function miniReport(totalArticles, { generatedAt, critical } = {}) {
  return JSON.stringify({
    ...(generatedAt ? { generated_at: generatedAt } : {}),
    assessment: {
      date: '2026-01-01',
      total_articles_analyzed: totalArticles,
      ...(critical ? { critical_signal: true } : {}),
    },
  });
}

describe('resolveReportJsonPathForDate', () => {
  let dir;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'res-report-test-'));
  });
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('prefers newer generated_at over higher article count', () => {
    const morning = join(dir, 'resilience-report-2026-01-01-0900.json');
    const evening = join(dir, 'resilience-report-2026-01-01-1800.json');
    // Morning run processed 500 routine articles; evening run processed 50 crisis articles but is newer
    writeFileSync(morning, miniReport(500, { generatedAt: '2026-01-01T09:00:00.000Z' }));
    writeFileSync(evening, miniReport(50, { generatedAt: '2026-01-01T18:00:00.000Z' }));

    const picked = resolveReportJsonPathForDate('2026-01-01', { reportsDir: dir });
    assert.strictEqual(picked, evening, 'newer generated_at should win over higher article count');
  });

  it('falls back to article count when generated_at is absent', () => {
    const rich = join(dir, 'resilience-report-2026-01-04-0900.json');
    const slim = join(dir, 'resilience-report-2026-01-04-1800.json');
    writeFileSync(rich, miniReport(79));
    writeFileSync(slim, miniReport(7));

    const picked = resolveReportJsonPathForDate('2026-01-04', { reportsDir: dir });
    assert.strictEqual(picked, rich, 'without generated_at, higher article count should win');
  });

  it('critical_signal flag always wins regardless of timestamp', () => {
    const normal = join(dir, 'resilience-report-2026-01-05-0900.json');
    const crisis = join(dir, 'resilience-report-2026-01-05-0600.json');
    // Crisis run is earlier but has critical_signal: true
    writeFileSync(normal, miniReport(500, { generatedAt: '2026-01-05T09:00:00.000Z' }));
    writeFileSync(crisis, miniReport(20, { generatedAt: '2026-01-05T06:00:00.000Z', critical: true }));

    const picked = resolveReportJsonPathForDate('2026-01-05', { reportsDir: dir });
    assert.strictEqual(picked, crisis, 'critical_signal should win over newer/larger reports');
  });

  it('ties on article count with newer mtime', () => {
    const a = join(dir, 'resilience-report-2026-01-02-1000.json');
    const b = join(dir, 'resilience-report-2026-01-02-1100.json');
    writeFileSync(a, miniReport(10));
    writeFileSync(b, miniReport(10));
    const older = new Date('2020-01-01');
    const newer = new Date('2024-06-01');
    utimesSync(a, older, older);
    utimesSync(b, newer, newer);

    const picked = resolveReportJsonPathForDate('2026-01-02', { reportsDir: dir });
    assert.strictEqual(picked, b);
  });

  it('resolves north-scoped report files separately from national reports', () => {
    const national = join(dir, 'resilience-report-2026-01-03-1000.json');
    const north = join(dir, 'resilience-report-north-2026-01-03-0900.json');
    writeFileSync(national, miniReport(50));
    writeFileSync(north, miniReport(12));

    assert.strictEqual(resolveReportJsonPathForDate('2026-01-03', { reportsDir: dir }), national);
    assert.strictEqual(resolveReportJsonPathForDate('2026-01-03', { reportsDir: dir, scope: 'north' }), north);
  });
});
