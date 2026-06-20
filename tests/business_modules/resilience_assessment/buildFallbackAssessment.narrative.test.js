import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackAssessment } from '../../../business_modules/resilience_assessment/app/componentSpecialistAgent.js';
import { INSUFFICIENT_SYNTHESIS_NARRATIVE } from '../../../business_modules/resilience_assessment/domain/services/narrativeTemplates.js';

describe('buildFallbackAssessment narrative', () => {
  const evidenceGraph = {
    by_component: {
      functional_continuity: {
        claims: [
          { claim_id: 'c1', text: 'שירותים פועלים כרגיל', support: [{ ref: 'sig:1' }] },
          { claim_id: 'c2', text: 'Water supply restored in the north', support: [{ ref: 'sig:2' }] },
        ],
        retrieval_gaps: [],
      },
    },
  };
  const epistemicProfile = {
    by_component: {
      functional_continuity: {
        signal_count: 2,
        dominance_warnings: [{ layer: 'source_type', key: 'pbo' }],
      },
    },
  };

  it('uses insufficient synthesis message when seeded claims exist', () => {
    const out = buildFallbackAssessment('functional_continuity', evidenceGraph, epistemicProfile, 'trace');
    assert.equal(out.narrative, INSUFFICIENT_SYNTHESIS_NARRATIVE);
    assert.doesNotMatch(out.narrative, /שירותים/);
    assert.equal(out.evidence_tree.length, 2);
    assert.match(out.evidence_tree[0].text, /שירותים/);
  });
});
