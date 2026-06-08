import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  needsLlmSynthesis,
  countOpenGaps,
} from '../../../business_modules/resilience_assessment/domain/services/synthesisPolicy.js';

describe('synthesisPolicy', () => {
  it('needsLlmSynthesis false on calm assessments', () => {
    assert.equal(needsLlmSynthesis({
      componentAssessments: [
        { component_id: 'leadership', severity: 'moderate', retrieval_gaps: [] },
        { component_id: 'functional_continuity', severity: 'low', retrieval_gaps: ['attempted: foo'] },
      ],
      epistemicProfile: { by_component: {} },
    }), false);
  });

  it('needsLlmSynthesis true on high severity', () => {
    assert.equal(needsLlmSynthesis({
      componentAssessments: [
        { component_id: 'leadership', severity: 'high', retrieval_gaps: [] },
      ],
      epistemicProfile: { by_component: {} },
    }), true);
  });

  it('needsLlmSynthesis true when open gaps exceed threshold', () => {
    assert.equal(needsLlmSynthesis({
      componentAssessments: [
        { component_id: 'a', severity: 'moderate', retrieval_gaps: ['g1', 'g2', 'g3', 'g4'] },
      ],
      epistemicProfile: { by_component: {} },
      gapThreshold: 3,
    }), true);
  });

  it('countOpenGaps excludes attempted prefix', () => {
    assert.equal(countOpenGaps([
      { retrieval_gaps: ['open gap', 'attempted: tried', 'another'] },
    ]), 2);
  });
});
