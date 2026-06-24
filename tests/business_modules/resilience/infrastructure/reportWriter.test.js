import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'os';

import { writeReport } from '../../../../business_modules/resilience/infrastructure/reportWriter.js';
import { buildAssessmentWindowMetadata } from '../../../../business_modules/resilience/app/assessSignalsHelpers.js';

describe('writeReport assessment_window', () => {
  let dir;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'report-writer-test-'));
  });
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('persists assessment_window when provided', () => {
    const outputBase = join(dir, 'resilience-report-2026-04-10');
    const assessment = {
      date: '2026-04-10',
      components: [],
      cross_component_synthesis: 'ok',
    };
    const assessmentWindow = buildAssessmentWindowMetadata('2026-04-10', 3, { pipelinePreset: '8comp-3' });
    writeReport(assessment, [], ['signals-news-2026-04-10.json'], outputBase, { assessmentWindow });

    const raw = JSON.parse(readFileSync(`${outputBase}.json`, 'utf8'));
    assert.deepStrictEqual(raw.assessment_window.days, 3);
    assert.strictEqual(raw.assessment_window.window_start, '2026-04-08');
    assert.strictEqual(raw.assessment_window.window_end, '2026-04-10');
    assert.strictEqual(raw.assessment_window.pipeline_preset, '8comp-3');
  });
});
