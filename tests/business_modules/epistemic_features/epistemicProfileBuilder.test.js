import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeEpistemicProfile } from '../../../business_modules/epistemic_features/domain/services/epistemicProfileBuilder.js';
import { buildEvidenceGraph } from '../../../cross-cut-modules/retrieval/evidenceGraph.js';

describe('epistemicProfileBuilder', () => {
  it('marks thin evidence when mass low', () => {
    const profile = computeEpistemicProfile([], { totalArticles: 10, reportDate: '2026-06-01' });
    assert.equal(profile.by_component.leadership.thin_evidence, true);
  });

  it('includes media_mention_mass from scoredComponents', () => {
    const profile = computeEpistemicProfile([], {
      totalArticles: 10,
      reportDate: '2026-06-01',
      scoredComponents: {
        leadership: { media_mention_mass: 2.5 },
      },
    });
    assert.equal(profile.by_component.leadership.media_mention_mass, 2.5);
  });
});

describe('evidenceGraph', () => {
  it('builds component claims structure', () => {
    const graph = buildEvidenceGraph({
      hits: [{ chunkId: 'c1', parentId: 'archive:news:1', text: 'test hit', sourceType: 'news' }],
      signals: [],
      epistemicProfile: { by_component: { leadership: { thin_evidence: true } } },
    });
    assert.ok(graph.by_component.leadership);
    assert.ok(Array.isArray(graph.by_component.leadership.claims));
  });
});
