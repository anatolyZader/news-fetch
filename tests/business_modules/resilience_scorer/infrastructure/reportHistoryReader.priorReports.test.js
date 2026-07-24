import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { loadPriorReports } from '../../../../business_modules/resilience_scorer/infrastructure/reportHistoryReader.js';
import { buildReportBasename } from '../../../../business_modules/resilience_scorer/domain/services/paths/reportNames.js';

function writeFixtureReport(dir, scopeId, reportDate, marker) {
  const basename = buildReportBasename({
    scopeId,
    days: 1,
    reportDate,
    runAt: new Date(`${reportDate}T12:00:00Z`),
  });
  writeFileSync(join(dir, `${basename}.json`), JSON.stringify({
    assessment: { report_date: reportDate, marker, components: [] },
  }));
}

describe('loadPriorReports scope filtering', () => {
  let dir;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'prior-reports-test-'));
    // Priors for target 2026-04-07: both scopes on 04-06, north-only on 04-05.
    writeFixtureReport(dir, 'national', '2026-04-06', 'nat-0406');
    writeFixtureReport(dir, 'north', '2026-04-06', 'north-0406');
    writeFixtureReport(dir, 'north', '2026-04-05', 'north-0405');
  });
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('north scope loads only north priors, oldest first', () => {
    const priors = loadPriorReports('2026-04-07', 2, dir, 'north');
    assert.deepEqual(priors.map((a) => a.marker), ['north-0405', 'north-0406']);
  });

  it('national scope (default) never sees regional priors', () => {
    const priors = loadPriorReports('2026-04-07', 2, dir);
    assert.deepEqual(priors.map((a) => a.marker), ['nat-0406']);
  });

  it('missing reports dir returns empty list', () => {
    assert.deepEqual(loadPriorReports('2026-04-07', 2, join(dir, 'nope'), 'north'), []);
  });
});
