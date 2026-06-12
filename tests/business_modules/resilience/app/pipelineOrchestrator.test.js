import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { assertAssessOnlySafe } from '../../../../business_modules/resilience/app/pipelineOrchestrator.js';

function miniReport(extra = {}) {
  return JSON.stringify({
    assessment: {
      date: '2026-04-15',
      total_articles_analyzed: 40,
      assessment_mode: 'normal',
      ...extra,
    },
  });
}

function baseOpts(overrides = {}) {
  return {
    targetDate: '2026-04-15',
    scope: 'north',
    assessOnly: true,
    force: false,
    replayMode: true,
    ...overrides,
  };
}

describe('assertAssessOnlySafe', () => {
  let rootDir;
  let reportsDir;

  before(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'pipeline-guard-'));
    reportsDir = join(rootDir, 'daily_reports');
    mkdirSync(reportsDir, { recursive: true });
  });

  after(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('throws when replay assess-only and a normal report exists', () => {
    writeFileSync(
      join(reportsDir, 'resilience-report-north-2026-04-15-1739.json'),
      miniReport(),
    );
    assert.throws(
      () => assertAssessOnlySafe(baseOpts(), rootDir),
      /Existing normal report/,
    );
  });

  it('does not throw when --force is set', () => {
    assert.doesNotThrow(() => assertAssessOnlySafe(baseOpts({ force: true }), rootDir));
  });

  it('allows replay assess-only when only degraded report exists', () => {
    const degradedDir = mkdtempSync(join(tmpdir(), 'pipeline-guard-degraded-'));
    const degradedReports = join(degradedDir, 'daily_reports');
    mkdirSync(degradedReports, { recursive: true });
    try {
      writeFileSync(
        join(degradedReports, 'resilience-report-north-2026-04-15-0715.json'),
        miniReport({
          assessment_mode: 'field_anchor_only',
          digital_quarantine_state: { active: true, reason: 'total_silence' },
          total_articles_analyzed: 563,
        }),
      );
      assert.doesNotThrow(() => assertAssessOnlySafe(baseOpts(), degradedDir));
    } finally {
      rmSync(degradedDir, { recursive: true, force: true });
    }
  });
});
