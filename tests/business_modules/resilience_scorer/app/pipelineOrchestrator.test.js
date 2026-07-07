import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { assertAssessOnlySafe } from '../../../../business_modules/resilience_scorer/app/pipelineOrchestrator.js';
import { PIPELINE_ACTIONS } from '../../../../business_modules/resilience_scorer/app/pipelineIngestPlan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const orchestratorSourcePath = join(
  __dirname,
  '../../../../business_modules/resilience_scorer/app/pipelineOrchestrator.js',
);

/** @returns {string[]} */
function extractIngestStepSwitchCases(source) {
  const fnStart = source.indexOf('async function executeIngestStep');
  assert.notEqual(fnStart, -1, 'executeIngestStep not found');
  const switchStart = source.indexOf('switch (step.action)', fnStart);
  assert.notEqual(switchStart, -1, 'executeIngestStep switch not found');
  const switchBodyStart = source.indexOf('{', switchStart);
  let depth = 0;
  let switchEnd = -1;
  for (let i = switchBodyStart; i < source.length; i++) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        switchEnd = i;
        break;
      }
    }
  }
  assert.notEqual(switchEnd, -1, 'executeIngestStep switch body not closed');
  const switchBody = source.slice(switchBodyStart, switchEnd + 1);
  return [...new Set([...switchBody.matchAll(/case '([^']+)':/g)].map((m) => m[1]))];
}

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
    reportsDir = join(rootDir, 'business_modules/resilience_scorer/data/daily_reports');
    mkdirSync(reportsDir, { recursive: true });
  });

  after(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('throws when replay assess-only and a normal report exists', () => {
    writeFileSync(
      join(reportsDir, 'resilience-report-north-data-2026-04-15-run-1739.json'),
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
    const degradedReports = join(degradedDir, 'business_modules/resilience_scorer/data/daily_reports');
    mkdirSync(degradedReports, { recursive: true });
    try {
      writeFileSync(
        join(degradedReports, 'resilience-report-north-data-2026-04-15-run-0715.json'),
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

describe('executeIngestStep switch parity', () => {
  it('handles every PipelineAction emitted by buildPipelineIngestPlan', () => {
    const source = readFileSync(orchestratorSourcePath, 'utf8');
    const handled = extractIngestStepSwitchCases(source);
    const expected = [...PIPELINE_ACTIONS].sort();
    const actual = [...handled].sort();
    assert.deepEqual(
      actual,
      expected,
      `executeIngestStep cases must match PIPELINE_ACTIONS.\n`
        + `  missing: ${expected.filter((a) => !handled.includes(a)).join(', ') || 'none'}\n`
        + `  extra: ${handled.filter((a) => !PIPELINE_ACTIONS.includes(a)).join(', ') || 'none'}`,
    );
  });
});
