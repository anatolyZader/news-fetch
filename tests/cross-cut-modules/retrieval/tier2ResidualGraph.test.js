import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceGraph } from '../../../cross-cut-modules/retrieval/evidenceGraph.js';
import { buildPlannerContext } from '../../../cross-cut-modules/retrieval/plannerContextBuilder.js';

describe('residual evidence graph', () => {
  it('injects residual observation claims', () => {
    const graph = buildEvidenceGraph({
      hits: [],
      signals: [],
      epistemicProfile: { by_component: {} },
      residualObservations: [{
        behavioral_description: 'Residents reported shelter overcrowding downtown',
        article_url: 'https://example.com/a1',
      }],
    });
    const allClaims = Object.values(graph.by_component).flatMap((c) => c.claims ?? []);
    assert.ok(allClaims.some((c) =>
      (c.epistemic_flags ?? []).includes('residual_observation')));
  });

  it('planner context includes residual_summary', () => {
    const ctx = buildPlannerContext({
      epistemicProfile: { by_component: {} },
      evidenceGraph: { by_component: {} },
      residualObservations: [{ behavioral_description: 'open obs' }],
    });
    assert.equal(ctx.residual_summary.count, 1);
  });
});
