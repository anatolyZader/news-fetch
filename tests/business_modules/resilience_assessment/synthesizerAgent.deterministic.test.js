import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSynthesis } from '../../../business_modules/resilience_assessment/app/synthesizerAgent.js';

describe('synthesizerAgent defaultSynthesis', () => {
  it('returns a multi-sentence summary naming the source-family limitation under dominance', () => {
    const componentAssessments = [
      { component_id: 'leadership', severity: 'moderate', retrieval_gaps: ['g1'] },
      { component_id: 'functional_continuity', severity: 'low', retrieval_gaps: ['g1'] },
      { component_id: 'narrative', severity: 'abstain', operator_status: 'insufficient_data', retrieval_gaps: [] },
    ];
    const epistemicProfile = {
      by_component: {
        leadership: { dominance_warnings: [{ layer: 'source_type', key: 'pbo' }] },
        functional_continuity: { dominance_warnings: [{ layer: 'source_type', key: 'pbo' }] },
        narrative: { dominance_warnings: [] },
      },
    };
    const out = defaultSynthesis(componentAssessments, epistemicProfile);
    assert.match(out.cross_component_synthesis, /single evidence channel/);
    assert.doesNotMatch(out.cross_component_synthesis, /\(pbo\)/);
    assert.match(out.cross_component_synthesis, /abstained/);
    // multi-sentence
    assert.ok(out.cross_component_synthesis.split('. ').length >= 2);
    // distinct gaps deduped
    assert.deepEqual(out.retrieval_gaps, ['g1']);
  });

  it('does not claim single-channel when dominance is widespread but channels are diverse', () => {
    const componentAssessments = [
      { component_id: 'leadership', severity: 'low', retrieval_gaps: [] },
      { component_id: 'functional_continuity', severity: 'low', retrieval_gaps: [] },
    ];
    const epistemicProfile = {
      by_component: {
        leadership: {
          source_diversity: 3,
          investigation_used: 40,
          dominance_warnings: [{ layer: 'source_type', key: 'pbo' }],
        },
        functional_continuity: {
          source_diversity: 2,
          investigation_used: 30,
          dominance_warnings: [{ layer: 'source_type', key: 'pbo' }],
        },
      },
    };
    const out = defaultSynthesis(componentAssessments, epistemicProfile);
    assert.doesNotMatch(out.cross_component_synthesis, /single evidence channel/);
    assert.match(out.cross_component_synthesis, /over-represented/);
  });

  it('does not claim source limitation when dominance is not widespread', () => {
    const componentAssessments = [
      { component_id: 'leadership', severity: 'low', retrieval_gaps: [] },
      { component_id: 'functional_continuity', severity: 'low', retrieval_gaps: [] },
    ];
    const epistemicProfile = { by_component: { leadership: {}, functional_continuity: {} } };
    const out = defaultSynthesis(componentAssessments, epistemicProfile);
    assert.doesNotMatch(out.cross_component_synthesis, /single source family/);
    assert.match(out.cross_component_synthesis, /within typical ranges/);
  });
});
