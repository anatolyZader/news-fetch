import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isRegionalReportScope,
  normalizeReportScopeId,
  reportFilePrefix,
  isRegionalReportFilename,
} from '../../../cross-cut-modules/geo/reportScopeIds.js';

describe('reportScopeIds', () => {
  it('normalizes center to jerusalem', () => {
    assert.equal(normalizeReportScopeId('center'), 'jerusalem');
  });

  it('builds regional report prefixes', () => {
    assert.equal(reportFilePrefix('national'), 'resilience-report');
    assert.equal(reportFilePrefix('south'), 'resilience-report-south');
    assert.equal(isRegionalReportScope('south'), true);
    assert.equal(isRegionalReportScope('national'), false);
  });

  it('detects regional report filenames', () => {
    assert.equal(isRegionalReportFilename('resilience-report-north-2026-05-04-1200.json'), true);
    assert.equal(isRegionalReportFilename('resilience-report-2026-05-04.json'), false);
  });
});
