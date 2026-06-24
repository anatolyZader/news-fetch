import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  buildAssessmentWindowMetadata,
  inferAssessmentWindowFromSourceFiles,
} from '../../../../business_modules/resilience/app/assessSignalsHelpers.js';

describe('assessment window metadata', () => {
  it('buildAssessmentWindowMetadata computes descending window dates', () => {
    const meta = buildAssessmentWindowMetadata('2026-04-10', 3, { pipelinePreset: '8comp-3' });
    assert.deepStrictEqual(meta.window_dates, ['2026-04-10', '2026-04-09', '2026-04-08']);
    assert.strictEqual(meta.window_start, '2026-04-08');
    assert.strictEqual(meta.window_end, '2026-04-10');
    assert.strictEqual(meta.pipeline_preset, '8comp-3');
  });

  it('inferAssessmentWindowFromSourceFiles counts consecutive days ending at report date', () => {
    const inferred = inferAssessmentWindowFromSourceFiles('2026-04-10', [
      'signals-news-2026-04-10.json',
      'signals-radio-2026-04-09.json',
      'signals-news-2026-04-08.json',
    ]);
    assert.strictEqual(inferred?.assessment_days, 3);
    assert.strictEqual(inferred?.window_start, '2026-04-08');
    assert.strictEqual(inferred?.window_end, '2026-04-10');
  });

  it('inferAssessmentWindowFromSourceFiles ignores non-consecutive historical bundles', () => {
    const inferred = inferAssessmentWindowFromSourceFiles('2026-04-11', [
      'signals-news-2026-03-29.json',
      'signals-news-2026-04-04.json',
      'signals-news-2026-04-11.json',
    ]);
    assert.strictEqual(inferred?.assessment_days, 1);
    assert.strictEqual(inferred?.window_start, '2026-04-11');
    assert.strictEqual(inferred?.window_end, '2026-04-11');
  });
});
