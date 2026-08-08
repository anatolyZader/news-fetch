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
  it('buildReportBasename emits labeled format with data date and produced datetime', () => {
    const runAt = new Date('2026-08-07T09:40:00.000Z');
    assert.equal(
      buildReportBasename({ scopeId: 'north', days: 1, reportDate: '2026-04-03', runAt }),
      'north-1-data-2026-04-03-produced-2026-08-07T0940Z',
    );
    assert.equal(
      buildReportBasename({ scopeId: 'national', days: 1, reportDate: '2026-05-23', runAt }),
      'national-1-data-2026-05-23-produced-2026-08-07T0940Z',
    );
    // Multi-day window
    const runAt2 = new Date('2026-05-23T15:45:00.000Z');
    assert.equal(
      buildReportBasename({ scopeId: 'north', days: 3, reportDate: '2026-05-23', runAt: runAt2 }),
      'north-3-data-2026-05-23-produced-2026-05-23T1545Z',
    );
  });

  it('parseReportFilename reads labeled names (current format)', () => {
    const parsed = parseReportFilename('north-1-data-2026-04-03-produced-2026-08-07T0940Z.json');
    assert.deepEqual(parsed, {
      format: 'labeled',
      scopeId: 'north',
      days: 1,
      reportDate: '2026-04-03',
      runId: '2026-08-07T0940Z',
    });
  });

  it('parseReportFilename reads labeled names without extension', () => {
    const parsed = parseReportFilename('national-1-data-2026-05-23-produced-2026-05-23T1545Z');
    assert.equal(parsed?.format, 'labeled');
    assert.equal(parsed?.reportDate, '2026-05-23');
    assert.equal(parsed?.runId, '2026-05-23T1545Z');
  });

  it('parseReportFilename reads labeled brief md names', () => {
    const parsed = parseReportFilename('north-1-data-2026-04-03-produced-2026-08-07T0940Z-brief.md');
    assert.equal(parsed?.format, 'labeled');
    assert.equal(parsed?.reportDate, '2026-04-03');
  });

  // --- Legacy read-compat (old compact format) ---
  it('parseReportFilename still reads legacy compact names', () => {
    const parsed = parseReportFilename('north-3-230526-1545.json');
    assert.deepEqual(parsed, {
      format: 'compact',
      scopeId: 'north',
      days: 3,
      reportDate: '2026-05-23',
      runId: '1545',
    });
  });

  it('parseReportFilename still reads legacy run-scoped names', () => {
    const parsed = parseReportFilename('resilience-report-north-data-2026-05-23-run-2026-05-23T121520Z.json');
    assert.equal(parsed?.format, 'legacy');
    assert.equal(parsed?.scopeId, 'north');
    assert.equal(parsed?.reportDate, '2026-05-23');
    assert.equal(parsed?.runId, '2026-05-23T121520Z');
  });

  it('parseReportFilename still reads legacy simple date names', () => {
    const parsed = parseReportFilename('resilience-report-2026-05-27.json');
    assert.equal(parsed?.scopeId, 'national');
    assert.equal(parsed?.reportDate, '2026-05-27');
  });

  // --- Scope + date matching ---
  it('reportFilenameMatchesDate scopes national vs regional (labeled format)', () => {
    assert.equal(
      reportFilenameMatchesDate('national-1-data-2026-05-23-produced-2026-05-23T1545Z.json', '2026-05-23', 'national'),
      true,
    );
    assert.equal(
      reportFilenameMatchesDate('north-1-data-2026-05-23-produced-2026-05-23T1545Z.json', '2026-05-23', 'national'),
      false,
    );
    assert.equal(
      reportFilenameMatchesDate('north-3-data-2026-05-23-produced-2026-05-23T1545Z.json', '2026-05-23', 'north'),
      true,
    );
  });

  it('reportFilenameMatchesDate still works for legacy compact names', () => {
    assert.equal(reportFilenameMatchesDate('national-1-230526-1545.json', '2026-05-23', 'national'), true);
    assert.equal(reportFilenameMatchesDate('north-1-230526-1545.json', '2026-05-23', 'national'), false);
  });

  it('isNationalReportFilename excludes regional names (labeled format)', () => {
    assert.equal(isNationalReportFilename('national-1-data-2026-05-23-produced-2026-05-23T1545Z.json'), true);
    assert.equal(isNationalReportFilename('north-3-data-2026-05-23-produced-2026-05-23T1545Z.json'), false);
  });

  it('ddMmYyFromIsoDate formats day first (retained for migration scripts)', () => {
    assert.equal(ddMmYyFromIsoDate('2026-05-23'), '230526');
  });
});
