import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildEvidenceGraph } from '../../../cross-cut-modules/retrieval/evidenceGraph.js';
import { buildRefKey } from '../../../business_modules/resilience_scorer/index.js';

/**
 * Regression: the graph used to look signals up in the narrative registry by
 * object identity and fall back to a local ref builder that emitted a bare
 * article index (`type@1`) where the registry holds `type@idx:1`. Signals are
 * cloned between stages, so the identity match routinely missed and the
 * divergent key shipped into narrative_claims[].signal_refs — unresolvable to
 * the schema validator, the grounding checker, chat citations and the
 * cross-report critique alike.
 */

function signal(overrides = {}) {
  return {
    signal_type: 'solidarity_help_others',
    article_index: 1,
    article_source: 'ynetnews.com',
    source_type: 'news',
    evidence: 'Neighbours organised transport for elderly residents.',
    ...overrides,
  };
}

function graphFor(signals, scoredLike) {
  return buildEvidenceGraph({
    hits: [],
    signals,
    epistemicProfile: { by_component: {} },
    scoredLike,
  });
}

function refsIn(graph) {
  return Object.values(graph.by_component)
    .flatMap((c) => c.claims ?? [])
    .flatMap((c) => [...(c.support ?? []), ...(c.contradict ?? [])])
    .map((x) => x.ref);
}

describe('evidenceGraph ref keys', () => {
  it('emits the canonical registry key, not a bare article index', () => {
    const s = signal();
    const refs = refsIn(graphFor([s]));

    assert.ok(refs.length > 0, 'expected at least one claim ref');
    assert.ok(refs.includes(buildRefKey(s)));
    assert.equal(buildRefKey(s), 'solidarity_help_others@idx:1');
    assert.ok(!refs.includes('solidarity_help_others@1'), 'bare-index ref must not be emitted');
  });

  it('agrees with buildRefKey for every article-key shape', () => {
    const shapes = [
      signal(),
      signal({ article_url: 'https://example.com/a' }),
      signal({ source_file: 'articles-2026-04-11.md' }),
      signal({ article_index: undefined }),
      signal({ article_index: undefined, source_type: undefined }),
    ];
    for (const s of shapes) {
      const refs = refsIn(graphFor([s]));
      assert.ok(refs.includes(buildRefKey(s)), `no canonical ref for ${JSON.stringify(s.article_url ?? s.source_file ?? s.article_index)}`);
    }
  });

  it('resolves a cloned signal to the same ref as the registered original', () => {
    const original = signal();
    // scoredLike builds the registry from these objects; the graph then sees a
    // structurally equal but distinct clone, which is what broke identity lookup.
    const scoredLike = { community_capital: { signals: [original] } };
    const clone = structuredClone(original);

    const refs = refsIn(graphFor([clone], scoredLike));
    assert.ok(refs.includes(buildRefKey(original)));
  });

  it('keeps signal refs distinguishable from retrieval-chunk refs', () => {
    const graph = buildEvidenceGraph({
      hits: [{
        parentId: 'archive:1',
        chunkId: 'archive:1#0',
        text: 'Municipal welfare office extended opening hours.',
        seed_origin: 'component_rag',
        component_id: 'community_capital',
      }],
      signals: [signal()],
      epistemicProfile: { by_component: {} },
    });

    const refs = refsIn(graph);
    assert.ok(refs.includes('solidarity_help_others@idx:1'), 'signal ref present');
    assert.ok(refs.includes('archive:1'), 'retrieval-chunk ref present');
  });
});
