import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackAssessment } from '../../../business_modules/specialist_agents/app/componentSpecialistAgent.js';

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

  it('builds connected prose from seeded claims instead of insufficient synthesis stub', () => {
    const out = buildFallbackAssessment('functional_continuity', evidenceGraph, epistemicProfile, 'trace');
    assert.match(out.narrative, /שירותים/);
    assert.match(out.narrative, /Separately,/);
    assert.doesNotMatch(out.narrative, /see supporting evidence below/i);
    assert.equal(out.evidence_tree.length, 2);
    assert.match(out.evidence_tree[0].text, /שירותים/);
  });
});
