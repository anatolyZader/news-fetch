import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'os';

import { writeReport } from '../../../../business_modules/resilience_scorer/infrastructure/reportWriter.js';
import { appendComponentDetails } from '../../../../business_modules/resilience_scorer/infrastructure/reportWriterSections.js';
import { buildAssessmentWindowMetadata } from '../../../../business_modules/resilience_scorer/app/assessment/assessSignalsHelpers.js';

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

function componentWithMix(mix) {
  return {
    component_id: 'leadership',
    confidence: 'medium',
    signal_count: 3,
    distinct_article_count: 2,
    narrative: 'test narrative',
    evidence_basis: {
      sufficiency: 'moderate',
      balance: 'mixed',
      positive_count: 2,
      negative_count: 1,
      source_mix: { news: 3 },
      construct_role_mix: mix,
    },
  };
}

describe('appendComponentDetails construct mix', () => {
  const formatters = {
    evidenceDirection: (pos, neg) => `${pos ?? 0}+/${neg ?? 0}-`,
    i18n: () => '',
  };

  it('renders construct mix in canonical order with underscores humanized', () => {
    const lines = [];
    appendComponentDetails(lines, {
      total_articles_analyzed: 5,
      components: [componentWithMix({ response: 1, pressure: 2, population_state: 1, _unknown: 4 })],
    }, formatters);
    const metrics = lines.find((l) => l.includes('constructs —'));
    assert.ok(metrics.includes('constructs — pressure: 2, response: 1, population state: 1'));
    assert.ok(!metrics.includes('_unknown'));
  });

  it('renders — when construct mix is empty', () => {
    const lines = [];
    appendComponentDetails(lines, {
      total_articles_analyzed: 5,
      components: [componentWithMix({})],
    }, formatters);
    const metrics = lines.find((l) => l.includes('constructs —'));
    assert.ok(metrics.includes('constructs — —'));
  });
});
