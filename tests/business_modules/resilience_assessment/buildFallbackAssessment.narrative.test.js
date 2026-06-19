import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackAssessment } from '../../../business_modules/resilience_assessment/app/componentSpecialistAgent.js';

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

  it('produces templated prose, not the raw bilingual claim concatenation', () => {
    const out = buildFallbackAssessment('functional_continuity', evidenceGraph, epistemicProfile, 'trace');
    const rawJoin = ['שירותים פועלים כרגיל', 'Water supply restored in the north'].join(' ');
    assert.notEqual(out.narrative, rawJoin);
    assert.doesNotMatch(out.narrative, /שירותים/);
    assert.match(out.narrative, /Functional continuity/);
    // operator boundary: no source_type slug leaks into the narrative
    assert.doesNotMatch(out.narrative, /\(pbo\)/);
    // raw quotes still preserved in evidence tree
    assert.equal(out.evidence_tree.length, 2);
    assert.match(out.evidence_tree[0].text, /שירותים/);
  });
});
