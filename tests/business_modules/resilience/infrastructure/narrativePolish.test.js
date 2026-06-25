import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { polishNarrativeFromClaims, buildPolishSystemPrompt } from '../../../../business_modules/resilience/infrastructure/narrativePolish.js';
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
  it('academic prose style prompt requests multi-paragraph synthesis', () => {
    const prev = process.env.RESILIENCE_NARRATIVE_PROSE_STYLE;
    process.env.RESILIENCE_NARRATIVE_PROSE_STYLE = 'academic';
    try {
      const prompt = buildPolishSystemPrompt();
      assert.match(prompt, /2–4 connected English paragraphs/);
      assert.match(prompt, /Never include PBO dashboard metadata/);
      assert.doesNotMatch(prompt, /avg=.*unlimited/);
    } finally {
      if (prev === undefined) delete process.env.RESILIENCE_NARRATIVE_PROSE_STYLE;
      else process.env.RESILIENCE_NARRATIVE_PROSE_STYLE = prev;
    }
  });

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

  it('polished narrative paraphrases PBO-style claims without avg= metadata', async () => {
    const pboClaim = {
      component_id: 'narrative',
      narrative_claims: [{
        text: '[Abelin] narrative: avg=81% — residents coping with extended alerts.',
        signal_refs: ['fear_expression@url:https://example.com/pbo-abelin'],
        relation: 'parallel',
      }],
    };
    const mockOutput = {
      components: [{
        component_id: 'narrative',
        narrative_claims: pboClaim.narrative_claims,
        narrative: (
          'Community narrative in Abelin reflects sustained coping under repeated alerts '
          + '([pbo](https://example.com/pbo-abelin)). Field reporting suggests disciplined adherence '
          + 'to safety guidance despite fatigue.'
        ),
        evidence: ['- Abelin field narrative [pbo](https://example.com/pbo-abelin)'],
      }],
      cross_component_synthesis: 'Narrative themes remain resilient across northern localities.',
    };
    const scored = { narrative: { score: 5, confidence: 'medium' } };
    const registry = buildSignalRefRegistry({
      narrative: [{
        signal_type: 'fear_expression',
        evidence: pboClaim.narrative_claims[0].text,
        article_url: 'https://example.com/pbo-abelin',
        source_type: 'pbo',
      }],
    });

    const out = await polishNarrativeFromClaims(
      { components: [pboClaim] },
      registry,
      scored,
      { client: mockPolishClient(mockOutput), skipProgress: true },
    );

    assert.ok(!out.components[0].narrative.includes('avg='));
    assert.match(out.components[0].narrative, /Abelin|alert/i);
  });
});
