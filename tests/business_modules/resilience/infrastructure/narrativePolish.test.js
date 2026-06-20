import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { polishNarrativeFromClaims } from '../../../../business_modules/resilience/infrastructure/narrativePolish.js';
import { buildSignalRefRegistry } from '../../../../business_modules/resilience/domain/services/narrativeGrounding/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  readFileSync(
    join(__dirname, '../../../../analyst/tuning/adversarial/narrativeGroundingCases.json'),
    'utf8',
  ),
);

function mockPolishClient(output) {
  return {
    messages: {
      stream: () => ({
        finalMessage: async () => ({
          content: [{ type: 'text', text: JSON.stringify(output) }],
          usage: { input_tokens: 100, output_tokens: 200 },
        }),
        [Symbol.asyncIterator]: async function* () {},
      }),
    },
  };
}

describe('narrativePolish', () => {
  it('returns polished narrative matching input claims', async () => {
    const scored = fixtures.scored_components;
    const registry = buildSignalRefRegistry(scored);
    const merged = {
      components: fixtures.good_narrative_output.components.map((c) => ({
        component_id: c.component_id,
        narrative_claims: c.narrative_claims,
      })),
    };

    const out = await polishNarrativeFromClaims(
      merged,
      registry,
      scored,
      {
        client: mockPolishClient(fixtures.good_narrative_output),
        skipProgress: true,
      },
    );

    assert.match(out.components[0].narrative, /sleep disruption/i);
    assert.ok(out.cross_component_synthesis.length > 0);
    assert.equal(out.components[0].narrative_claims.length, 2);
  });
});
