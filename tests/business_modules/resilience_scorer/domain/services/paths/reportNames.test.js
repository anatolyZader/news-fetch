import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  buildReportBasename,
  parseReportFilename,
  isNationalReportFilename,
  reportFilenameMatchesDate,
  ddMmYyFromIsoDate,
} from '../../../../../../business_modules/resilience_scorer/domain/services/paths/reportNames.js';

describe('reportArtifactNames', () => {
  it('buildReportBasename encodes scope, days, date, and run time', () => {
    const runAt = new Date('2026-05-23T15:45:00.000Z');
    assert.equal(
      buildReportBasename({ scopeId: 'north', days: 3, reportDate: '2026-05-23', runAt }),
      'north-3-230526-1545',
    );
    assert.equal(
      buildReportBasename({ scopeId: 'national', days: 1, reportDate: '2026-05-23', runAt }),
      'national-1-230526-1545',
    );
  });

  it('parseReportFilename reads compact names', () => {
    const parsed = parseReportFilename('north-3-230526-1545.json');
    assert.deepEqual(parsed, {
      format: 'compact',
      scopeId: 'north',
      days: 3,
      reportDate: '2026-05-23',
      runId: '1545',
    });
  });

  it('parseReportFilename reads legacy run-scoped names', () => {
    const parsed = parseReportFilename('resilience-report-north-data-2026-05-23-run-2026-05-23T121520Z.json');
    assert.equal(parsed?.format, 'legacy');
    assert.equal(parsed?.scopeId, 'north');
    assert.equal(parsed?.reportDate, '2026-05-23');
    assert.equal(parsed?.runId, '2026-05-23T121520Z');
  });

  it('reportFilenameMatchesDate scopes national vs regional', () => {
    assert.equal(reportFilenameMatchesDate('national-1-230526-1545.json', '2026-05-23', 'national'), true);
    assert.equal(reportFilenameMatchesDate('north-1-230526-1545.json', '2026-05-23', 'national'), false);
    assert.equal(reportFilenameMatchesDate('north-3-230526-1545.json', '2026-05-23', 'north'), true);
  });

  it('isNationalReportFilename excludes regional compact names', () => {
    assert.equal(isNationalReportFilename('national-1-230526-1545.json'), true);
    assert.equal(isNationalReportFilename('north-3-230526-1545.json'), false);
  });

  it('parseReportFilename reads legacy simple date names', () => {
    const parsed = parseReportFilename('resilience-report-2026-05-27.json');
    assert.equal(parsed?.scopeId, 'national');
    assert.equal(parsed?.reportDate, '2026-05-27');
  });

  it('ddMmYyFromIsoDate formats day first', () => {
    assert.equal(ddMmYyFromIsoDate('2026-05-23'), '230526');
  });
});
