import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compactComponentGraph,
  compactEpistemicSlice,
} from '../../../cross-cut-modules/retrieval/compactEvidenceGraph.js';

describe('compactEvidenceGraph', () => {
  it('caps claim text and preserves refs', () => {
    const longText = 'x'.repeat(200);
    const out = compactComponentGraph({
      claims: [{
        claim_id: 'c1',
        text: longText,
        support: [{ ref: 'src:abc' }],
        contradict: [{ ref: 'src:def' }],
        epistemic_flags: [],
      }],
      retrieval_gaps: ['need more field evidence'],
    });
    assert.equal(out.claims[0].text.length, 120);
    assert.deepEqual(out.claims[0].support_refs, ['src:abc', 'src:def']);
    assert.deepEqual(out.gaps, ['need more field evidence']);
  });

  it('extracts OOV cluster from claim ref', () => {
    const out = compactComponentGraph({
      claims: [{
        claim_id: 'o1',
        text: 'Out of vocabulary burst about shelters',
        support: [{ ref: 'oov:shelter_cluster' }],
        epistemic_flags: ['oov_cluster'],
      }],
    });
    assert.equal(out.oov[0].cluster_key, 'shelter_cluster');
    assert.ok(out.oov[0].sample_80.length <= 80);
  });

  it('compactEpistemicSlice keeps first dominance warning only', () => {
    const out = compactEpistemicSlice({
      evidence_mass: 5,
      thin_evidence: false,
      contested: true,
      delta_significance: 'HIGH',
      media_mention_mass: 2,
      dominance_warnings: [
        { message: 'news dominates' },
        { message: 'ignored' },
      ],
    });
    assert.equal(out.mass, 5);
    assert.equal(out.contested, true);
    assert.equal(out.dominance, 'news dominates');
  });

  it('compactEpistemicSlice carries construct_role_mix as constructs', () => {
    const out = compactEpistemicSlice({
      evidence_mass: 3,
      construct_role_mix: { pressure: 2, response: 1 },
    });
    assert.deepEqual(out.constructs, { pressure: 2, response: 1 });
    assert.equal(compactEpistemicSlice({}).constructs, null);
  });
});
