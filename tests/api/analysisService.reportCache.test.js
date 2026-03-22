import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { resolveReportJsonPathForDate } from '../../api/analysisService.js';

function miniReport(totalArticles) {
  return JSON.stringify({
    assessment: { date: '2026-01-01', total_articles_analyzed: totalArticles },
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

  it('prefers higher total_articles_analyzed over newer mtime', () => {
    const rich = join(dir, 'resilience-report-2026-01-01-0900.json');
    const slim = join(dir, 'resilience-report-2026-01-01-1800.json');
    writeFileSync(rich, miniReport(79));
    writeFileSync(slim, miniReport(7));

    const picked = resolveReportJsonPathForDate('2026-01-01', { reportsDir: dir });
    assert.strictEqual(picked, rich);
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
});
