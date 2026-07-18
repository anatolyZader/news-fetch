import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { generateNarrativesLegacy } from '../../../../business_modules/resilience_scorer/infrastructure/claudeNarratives.js';

function mockNarrativeClient(output, calls = []) {
  return {
    messages: {
      stream: (req) => {
        calls.push(req);
        return {
          finalMessage: async () => ({
            content: [{ type: 'text', text: JSON.stringify(output) }],
            usage: { input_tokens: 10, output_tokens: 20 },
          }),
          [Symbol.asyncIterator]: async function* () {},
        };
      },
    },
  };
}

const SCORED = {
  narrative: { score: 6, certainty: 0.8, confidence: 'medium', signals: [] },
  leadership: { score: 4, certainty: 0.4, confidence: 'low', signals: [] },
};

const MOCK_OUTPUT = {
  cross_component_synthesis: 'Cross-component synthesis text.',
  components: [{
    component_id: 'narrative',
    narrative: 'Residents describe steady coping under repeated alerts.',
    evidence: [],
    narrative_claims: [],
  }],
};

describe('claudeNarratives LLM port seam', () => {
  it('generates an assessment payload through an injected client (no SDK singleton)', async () => {
    const prevGrounding = process.env.RESILIENCE_NARRATIVE_GROUNDING;
    process.env.RESILIENCE_NARRATIVE_GROUNDING = '0';
    const calls = [];
    const usage = [];
    try {
      const payload = await generateNarrativesLegacy(SCORED, [], '2026-07-18', 7, {
        client: mockNarrativeClient(MOCK_OUTPUT, calls),
        onUsage: (u) => usage.push(u),
      });

      assert.equal(calls.length, 1);
      assert.equal(calls[0].max_tokens, 16000);
      assert.equal(payload.date, '2026-07-18');
      assert.equal(payload.total_articles_analyzed, 7);
      // certainty-weighted headline over the two scored components
      assert.equal(payload.overall_resilience_score, 5);
      assert.equal(payload.components.length, 8);
      const narrative = payload.components.find((c) => c.component_id === 'narrative');
      assert.match(narrative.narrative, /steady coping/);
      assert.equal(payload.cross_component_synthesis, 'Cross-component synthesis text.');
      assert.ok(usage.some((u) => u.label === '[Step 2 — Narratives]' && u.usage.output_tokens === 20));
    } finally {
      if (prevGrounding === undefined) delete process.env.RESILIENCE_NARRATIVE_GROUNDING;
      else process.env.RESILIENCE_NARRATIVE_GROUNDING = prevGrounding;
    }
  });
});
