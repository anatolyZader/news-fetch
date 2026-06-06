import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEvidenceGraph,
  classifyGap,
} from '../../../cross-cut-modules/retrieval/evidenceGraph.js';

describe('evidenceGraph OOV', () => {
  it('classifies gap types', () => {
    assert.equal(classifyGap('need more corroborating evidence for leadership', 'leadership').gap_type, 'data');
    assert.equal(classifyGap('diversify sources: news dominates', 'leadership').gap_type, 'investigation');
  });

  it('adds OOV cluster claims when burst alert', () => {
    const graph = buildEvidenceGraph({
      hits: [],
      signals: [],
      epistemicProfile: { by_component: { narrative: { thin_evidence: false } } },
      oovBurst: {
        alert: true,
        top_clusters: [
          { cluster_key: 'k1', count: 5, keywords: ['shelter', 'delay'], sample_evidence: 'shelter delay reported' },
          { cluster_key: 'k2', count: 4, keywords: ['water'], sample_evidence: 'water shortage' },
          { cluster_key: 'k3', count: 3, keywords: ['medicine'], sample_evidence: 'medicine access' },
          { cluster_key: 'k4', count: 2, keywords: ['extra'], sample_evidence: 'should cap' },
        ],
      },
    });
    assert.equal(graph.oov_cluster_count, 3);
    assert.equal(graph.nodes.oov_clusters.length, 3);
    const allClaims = Object.values(graph.by_component).flatMap((c) => c.claims);
    const oovClaims = allClaims.filter((c) => c.epistemic_flags?.includes('oov_cluster'));
    assert.ok(oovClaims.length >= 3);
    assert.ok(oovClaims.every((c) => c.epistemic_flags.includes('unverified')));
  });

  it('adds rag_seed claims from component hits', () => {
    const graph = buildEvidenceGraph({
      hits: [{
        parentId: 'archive:1',
        chunkId: 'c1',
        text: 'leadership coordination in municipality',
        seed_origin: 'component_rag',
        component_id: 'leadership',
      }],
      signals: [],
      epistemicProfile: { by_component: { leadership: { thin_evidence: false } } },
    });
    const claims = graph.by_component.leadership.claims;
    assert.ok(claims.some((c) => c.epistemic_flags?.includes('rag_seed')));
  });
});
