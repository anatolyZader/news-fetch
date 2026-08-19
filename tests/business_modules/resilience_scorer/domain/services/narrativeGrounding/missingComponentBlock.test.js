import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSignalRefRegistry,
  validateNarrativeOutput,
} from '../../../../../../business_modules/resilience_scorer/domain/services/narrativeGrounding/index.js';

/**
 * Regression guard for the unreachable missing-block check.
 *
 * The guard used to test membership of the polish OUTPUT list, which is the same
 * list the component was looked up in — so inside `if (!comp)` it was false by
 * construction and a dropped polish shard validated clean. north 2026-04-03 lost
 * community_capital and leadership to that path.
 */
function fixture() {
  const registry = buildSignalRefRegistry({
    community_capital: {
      signals: [{
        signal_type: 'community_volunteering',
        article_url: 'https://a.example/1',
        evidence: 'Volunteers ran weekend home visits',
      }],
    },
  });
  const scoredComponents = { community_capital: { signal_count: 4 } };
  // Polish answered for nothing: the component block never came back.
  const narratives = { components: [], cross_component_synthesis: '' };
  return { registry, scoredComponents, narratives };
}

describe('validateNarrativeOutput missing component block', () => {
  it('errors when a requested component came back with no block', () => {
    const { registry, scoredComponents, narratives } = fixture();
    const result = validateNarrativeOutput(narratives, {
      scoredComponents,
      registry,
      requestedComponentIds: ['community_capital'],
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((e) => e.includes('community_capital: missing component block')),
      `expected missing-block error, got: ${JSON.stringify(result.errors)}`,
    );
  });

  it('stays silent when the caller did not declare a requested set', () => {
    const { registry, scoredComponents, narratives } = fixture();
    const result = validateNarrativeOutput(narratives, { scoredComponents, registry });
    assert.ok(
      !result.errors.some((e) => e.includes('missing component block')),
      'callers that do not shard must not be forced into this check',
    );
  });

  it('stays silent for a requested component that carries no signals', () => {
    const { registry, narratives } = fixture();
    const result = validateNarrativeOutput(narratives, {
      scoredComponents: { community_capital: { signal_count: 0 } },
      registry,
      requestedComponentIds: ['community_capital'],
    });
    assert.ok(!result.errors.some((e) => e.includes('missing component block')));
  });

  it('stays silent when the component was returned', () => {
    const { registry, scoredComponents } = fixture();
    const ref = [...registry.byRef.keys()][0];
    const result = validateNarrativeOutput({
      components: [{
        component_id: 'community_capital',
        narrative: 'Volunteers ran weekend home visits.',
        evidence: ['Volunteers ran weekend home visits'],
        narrative_claims: [{
          text: 'Volunteers ran weekend home visits.',
          signal_refs: [ref],
          relation: 'parallel',
        }],
      }],
      cross_component_synthesis: '',
    }, { scoredComponents, registry, requestedComponentIds: ['community_capital'] });
    assert.ok(!result.errors.some((e) => e.includes('missing component block')));
  });
});
