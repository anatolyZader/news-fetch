import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  resolveReportJsonPathForDate,
  getAvailableReportEditions,
  getCachedReport,
  listReportJsonPathsForDate,
  parseReportRunIdFromFilename,
} from '../../../../business_modules/resilience/index.js';

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

  it('getAvailableReportEditions returns window metadata and infers legacy source_files', () => {
    const withWindow = join(dir, 'resilience-report-2026-06-01.json');
    writeFileSync(withWindow, JSON.stringify({
      generated_at: '2026-06-01T12:00:00.000Z',
      assessment_window: {
        days: 3,
        report_date: '2026-06-01',
        window_start: '2026-05-30',
        window_end: '2026-06-01',
      },
      assessment: { date: '2026-06-01', total_articles_analyzed: 42 },
      source_files: ['signals-news-2026-06-01.json'],
    }));

    const legacy = join(dir, 'resilience-report-2026-06-02.json');
    writeFileSync(legacy, JSON.stringify({
      generated_at: '2026-06-02T08:00:00.000Z',
      assessment: { date: '2026-06-02', total_articles_analyzed: 10 },
      source_files: [
        'signals-news-2026-06-02.json',
        'signals-radio-2026-06-01.json',
        'signals-news-2026-05-31.json',
      ],
    }));

    const editions = getAvailableReportEditions({ reportsDir: dir, scope: 'national' });
    const june1 = editions.find((e) => e.date === '2026-06-01');
    const june2 = editions.find((e) => e.date === '2026-06-02');
    assert.strictEqual(june1?.assessment_days, 3);
    assert.strictEqual(june1?.window_start, '2026-05-30');
    assert.strictEqual(june2?.assessment_days, 3);
    assert.strictEqual(june2?.window_start, '2026-05-31');
  });

  it('lists multiple same-day runs with distinct run_id values', () => {
    const morning = join(dir, 'resilience-report-2026-07-01-0900.json');
    const evening = join(dir, 'resilience-report-2026-07-01-1800.json');
    writeFileSync(morning, miniReport(40, { generatedAt: '2026-07-01T09:00:00.000Z' }));
    writeFileSync(evening, miniReport(12, { generatedAt: '2026-07-01T18:00:00.000Z' }));

    const editions = getAvailableReportEditions({ reportsDir: dir, scope: 'national' })
      .filter((e) => e.date === '2026-07-01');
    assert.equal(editions.length, 2);
    assert.deepEqual(
      editions.map((e) => e.run_id).sort((a, b) => a.localeCompare(b)),
      ['0900', '1800'],
    );
    assert.strictEqual(editions[0].run_id, '1800');
  });

  it('keeps exact file as default winner when exact and suffixed coexist', () => {
    const exact = join(dir, 'resilience-report-2026-07-02.json');
    const suffixed = join(dir, 'resilience-report-2026-07-02-1800.json');
    writeFileSync(exact, miniReport(10, { generatedAt: '2026-07-02T08:00:00.000Z' }));
    writeFileSync(suffixed, miniReport(99, { generatedAt: '2026-07-02T18:00:00.000Z' }));

    assert.strictEqual(
      resolveReportJsonPathForDate('2026-07-02', { reportsDir: dir }),
      exact,
    );
    const editions = getAvailableReportEditions({ reportsDir: dir, scope: 'national' })
      .filter((e) => e.date === '2026-07-02');
    assert.equal(editions.length, 2);
  });

  it('loads a specific run via runId', () => {
    const morning = join(dir, 'resilience-report-2026-07-03-0900.json');
    const evening = join(dir, 'resilience-report-2026-07-03-1800.json');
    writeFileSync(morning, miniReport(40, { generatedAt: '2026-07-03T09:00:00.000Z' }));
    writeFileSync(evening, miniReport(12, { generatedAt: '2026-07-03T18:00:00.000Z' }));

    assert.strictEqual(
      resolveReportJsonPathForDate('2026-07-03', { reportsDir: dir, runId: '0900' }),
      morning,
    );
    const loaded = getCachedReport(null, {
      reportsDir: dir,
      scope: 'national',
      date: '2026-07-03',
      runId: '0900',
    });
    assert.strictEqual(loaded?.generated_at, '2026-07-03T09:00:00.000Z');
  });

  it('listReportJsonPathsForDate returns exact and suffixed paths', () => {
    const exact = join(dir, 'resilience-report-2026-07-04.json');
    const suffixed = join(dir, 'resilience-report-2026-07-04-1200.json');
    writeFileSync(exact, miniReport(1));
    writeFileSync(suffixed, miniReport(2));

    const paths = listReportJsonPathsForDate('2026-07-04', { reportsDir: dir });
    assert.equal(paths.length, 2);
    assert.ok(paths.includes(exact));
    assert.ok(paths.includes(suffixed));
  });

  it('parseReportRunIdFromFilename extracts suffix or null', () => {
    assert.strictEqual(
      parseReportRunIdFromFilename('resilience-report-2026-07-05.json'),
      null,
    );
    assert.strictEqual(
      parseReportRunIdFromFilename('resilience-report-2026-07-05-1530.json'),
      '1530',
    );
    assert.strictEqual(
      parseReportRunIdFromFilename('resilience-report-north-2026-07-05-1530.json', 'north'),
      '1530',
    );
  });
});
