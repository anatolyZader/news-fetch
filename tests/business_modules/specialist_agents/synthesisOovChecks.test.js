import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applySynthesisOovChecks } from '../../../business_modules/specialist_agents/domain/services/synthesisOovChecks.js';

describe('applySynthesisOovChecks', () => {
  it('appends unaddressed OOV cluster to synthesis and attention', () => {
    const synth = {
      cross_component_synthesis: 'Overall stable.',
      attention_items: [],
    };
    const out = applySynthesisOovChecks(synth, {
      oovClusters: [{
        cluster_key: 'shelter_panic',
        keywords: ['מקלט', 'פanic'],
        sample_evidence: 'crowd at shelter entrance',
        count: 4,
      }],
    });
    assert.equal(out.cross_component_synthesis, 'Overall stable.');
    assert.ok(out.attention_items.some((a) => a.id === 'oov:unaddressed:shelter_panic'));
  });

  it('skips cluster already mentioned in synthesis', () => {
    const synth = {
      cross_component_synthesis: 'crowd at shelter entrance noted in field reports.',
      attention_items: [],
    };
    const out = applySynthesisOovChecks(synth, {
      oovClusters: [{
        cluster_key: 'shelter',
        sample_evidence: 'crowd at shelter entrance',
        count: 2,
      }],
    });
    assert.equal(out.attention_items.length, 0);
  });
});
