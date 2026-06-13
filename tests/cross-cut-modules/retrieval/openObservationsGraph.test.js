import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceGraph } from '../../../cross-cut-modules/retrieval/evidenceGraph.js';

describe('openObservations evidence graph', () => {
  it('injects pre-routed pipeline observations with open ref prefix and cap', () => {
    const prevCap = process.env.RESILIENCE_OPEN_OBS_GRAPH_CAP;
    process.env.RESILIENCE_OPEN_OBS_GRAPH_CAP = '2';

    const observations = [
      {
        observation_id: 'a1',
        evidence: 'Volunteers organized mutual aid',
        confidence: 'high',
        component_id: 'community_capital',
        routing_confidence: 0.9,
        source: 'pipeline',
      },
      {
        observation_id: 'a2',
        evidence: 'Schools closed early',
        confidence: 'medium',
        component_id: 'functional_continuity',
        routing_confidence: 0.8,
        source: 'pipeline',
      },
      {
        observation_id: 'a3',
        evidence: 'Anxiety reported in shelters',
        confidence: 'high',
        component_id: 'wellbeing_at_risk',
        routing_confidence: 0.7,
        source: 'pipeline',
      },
    ];

    const graph = buildEvidenceGraph({
      hits: [],
      signals: [],
      epistemicProfile: { by_component: {} },
      openObservations: observations,
      totalArticles: 10,
    });

    const allClaims = Object.values(graph.by_component).flatMap((c) => c.claims ?? []);
    const openClaims = allClaims.filter((c) => (c.epistemic_flags ?? []).includes('open_observation'));
    assert.equal(openClaims.length, 2);
    assert.ok(openClaims.every((c) => c.support?.[0]?.ref?.startsWith('open:')));
    assert.ok(openClaims.every((c) => !(c.epistemic_flags ?? []).includes('archive_only')));

    process.env.RESILIENCE_OPEN_OBS_GRAPH_CAP = prevCap;
  });

  it('dedupes merged agent loader by observation id', async () => {
    const { loadOpenObservationsForAgent } = await import('../../../cross-cut-modules/retrieval/residualObservations.js');
    const merged = loadOpenObservationsForAgent('2026-04-03', {
      preRouted: [{
        observation_id: 'dup-1',
        evidence: 'Same fact',
        source: 'pipeline',
        component_id: 'narrative',
      }],
      reportsDir: '/nonexistent',
    });
    assert.equal(merged.length, 1);
    assert.equal(merged[0].observation_id, 'dup-1');
  });
});
