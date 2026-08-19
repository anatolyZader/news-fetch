import { describe, it } from 'node:test';
import { strict as assert } from 'assert';

import { polishNarrativeFromClaims } from '../../../../business_modules/resilience_scorer/infrastructure/narrativePolish.js';
import { buildSignalRefRegistry } from '../../../../business_modules/resilience_scorer/domain/services/narrative/signalRefRegistry.js';

/**
 * A polish shard that answered for only some of its components used to be
 * indistinguishable from one that answered fully: survivors were merged, the rest
 * silently fell through to deterministic fallback prose. north 2026-04-03 lost
 * community_capital and leadership exactly that way.
 */
const COMPONENT_IDS = ['narrative', 'community_capital', 'leadership'];

function buildFixture() {
  const scored = {};
  for (const id of COMPONENT_IDS) {
    scored[id] = {
      signals: [{
        signal_type: 'community_volunteering',
        article_url: `https://example.test/${id}`,
        evidence: `evidence for ${id}`,
      }],
    };
  }
  const registry = buildSignalRefRegistry(scored);
  const refs = [...registry.byRef.keys()];
  const mergedNarratives = {
    components: COMPONENT_IDS.map((id, i) => ({
      component_id: id,
      narrative_claims: [{ text: `claim for ${id}`, signal_refs: [refs[i]], relation: 'parallel' }],
    })),
  };
  return { registry, scored, mergedNarratives };
}

function legFor(id) {
  return {
    component_id: id,
    narrative: `Polished prose for ${id}.`,
    evidence: [`evidence for ${id}`],
    narrative_claims: [],
  };
}

/**
 * @param {(requested: string[], call: number) => string[]} answerWith
 */
function stubPort(answerWith, calls) {
  return {
    stream: async (params) => {
      const text = params.messages[0].content;
      // formatClaimsBlock is the only part of the prompt filtered by componentIds,
      // so the per-component claim text is what says who was actually asked for.
      const requested = COMPONENT_IDS.filter((id) => text.includes(`claim for ${id}`));
      const answered = answerWith(requested, calls.length);
      calls.push({ requested, answered });
      const payload = {
        components: answered.map(legFor),
        cross_component_synthesis: '- synthesis',
      };
      return {
        finalMessage: async () => ({
          content: [{ type: 'text', text: JSON.stringify(payload) }],
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
        [Symbol.asyncIterator]: async function* () {},
      };
    },
  };
}

async function runSharded(port) {
  const { registry, scored, mergedNarratives } = buildFixture();
  return polishNarrativeFromClaims(mergedNarratives, registry, scored, {
    llmPort: port,
    skipProgress: true,
    shardSize: 3,
    shardMinComponents: 1,
  });
}

describe('polishSharded refill', () => {
  it('re-asks for components a shard dropped', async () => {
    const calls = [];
    // First shard answers for one of three; the refill answers for the rest.
    const port = stubPort((requested, n) => (n === 0 ? requested.slice(0, 1) : requested), calls);

    const result = await runSharded(port);

    const refill = calls.find((c) => c.requested.length === 2);
    assert.ok(refill, `expected a refill call for the two dropped components, saw: ${JSON.stringify(calls.map((c) => c.requested))}`);
    assert.deepEqual(
      [...refill.requested].sort(),
      ['community_capital', 'leadership'],
      'refill must ask for exactly the missing ids',
    );
    assert.deepEqual(
      result.components.map((c) => c.component_id).sort(),
      [...COMPONENT_IDS].sort(),
      'every requested component must come back after the refill',
    );
  });

  it('does not refill when the shard answered in full', async () => {
    const calls = [];
    const port = stubPort((requested) => requested, calls);

    await runSharded(port);

    // The synthesis call carries no claims block, so it registers zero requested ids.
    const shardCalls = calls.filter((c) => c.requested.length > 0);
    assert.equal(shardCalls.length, 1, 'the single full shard must not trigger a refill');
    assert.equal(calls.length, 2, 'one shard + one synthesis call');
  });

  it('gives up after one refill instead of looping', async () => {
    const calls = [];
    // Never answers for leadership, on any call.
    const port = stubPort((requested) => requested.filter((id) => id !== 'leadership'), calls);

    const result = await runSharded(port);

    const refills = calls.filter((c) => c.requested.includes('leadership') && c.requested.length < 3);
    assert.equal(refills.length, 1, 'exactly one refill attempt for a component the model will not write');
    assert.ok(
      !result.components.some((c) => c.component_id === 'leadership'),
      'the unanswered component is left for validation to re-ask',
    );
  });
});
