import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  needsLlmSynthesis,
  countOpenGaps,
} from '../../../business_modules/resilience_assessment/domain/services/synthesisPolicy.js';

describe('synthesisPolicy', () => {
  it('needsLlmSynthesis true on calm assessments by default', () => {
    assert.equal(needsLlmSynthesis({
      componentAssessments: [
        { component_id: 'leadership', severity: 'moderate', retrieval_gaps: [] },
        { component_id: 'functional_continuity', severity: 'low', retrieval_gaps: ['attempted: foo'] },
      ],
      epistemicProfile: { by_component: {} },
    }), true);
  });

  it('needsLlmSynthesis false when budget degrade mode set', () => {
    assert.equal(needsLlmSynthesis({
      componentAssessments: [
        { component_id: 'leadership', severity: 'high', retrieval_gaps: [] },
      ],
      budget: { degradeMode: 'focus_top_3_components' },
    }), false);
  });

  it('needsLlmSynthesis false when degradeReason set', () => {
    assert.equal(needsLlmSynthesis({
      componentAssessments: [{ component_id: 'a', severity: 'high' }],
      degradeReason: 'budget_exceeded',
    }), false);
  });

  it('countOpenGaps excludes attempted prefix', () => {
    assert.equal(countOpenGaps([
      { retrieval_gaps: ['open gap', 'attempted: tried', 'another'] },
    ]), 2);
  });
});
