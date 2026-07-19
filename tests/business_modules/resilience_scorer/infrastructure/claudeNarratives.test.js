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
  narrative: {
    confidence: 'medium',
    signal_count: 2,
    distinct_article_count: 2,
    source_diversity: 2,
    evidence_basis: { sufficiency: 'moderate', balance: 'mixed' },
    signals: [
      { signal_type: 'fear_expression', evidence: 'Residents report alerts.', article_url: 'https://example.com/a' },
      { signal_type: 'rumor_spread', evidence: 'Rumors circulating.', article_url: 'https://example.com/b' },
    ],
  },
  leadership: { confidence: 'low', signal_count: 0, signals: [] },
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
      // Narrative-first payload: no headline score, no calibrated score, no capacities.
      assert.equal('overall_resilience_score' in payload, false);
      assert.equal('overall_score_calibrated' in payload, false);
      assert.equal('norris_capacities' in payload, false);
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

  it('emits evidence-based component fields with no score keys', async () => {
    const prevGrounding = process.env.RESILIENCE_NARRATIVE_GROUNDING;
    process.env.RESILIENCE_NARRATIVE_GROUNDING = '0';
    try {
      const payload = await generateNarrativesLegacy(SCORED, [], '2026-07-18', 7, {
        client: mockNarrativeClient(MOCK_OUTPUT),
      });

      const narrative = payload.components.find((c) => c.component_id === 'narrative');
      assert.equal(narrative.confidence, 'medium');
      assert.equal(narrative.signal_count, 2);
      assert.equal(narrative.distinct_article_count, 2);
      assert.equal(narrative.source_diversity, 2);
      assert.deepEqual(narrative.evidence_basis, { sufficiency: 'moderate', balance: 'mixed' });
      assert.ok(Array.isArray(narrative.top_contributors));
      assert.equal(narrative.top_contributors.length, 2);
      assert.ok(Array.isArray(narrative.manifestations_evidenced));
      assert.ok(Array.isArray(narrative.narrative_claims));
      assert.equal(typeof narrative.data_quality_caveat, 'string');
      for (const comp of payload.components) {
        assert.equal('score' in comp, false);
        assert.equal('score_low' in comp, false);
        assert.equal('score_high' in comp, false);
        assert.equal('certainty' in comp, false);
      }
      const leadership = payload.components.find((c) => c.component_id === 'leadership');
      assert.equal(leadership.confidence, 'low');
      assert.equal(leadership.signal_count, 0);
      assert.deepEqual(leadership.top_contributors, []);
    } finally {
      if (prevGrounding === undefined) delete process.env.RESILIENCE_NARRATIVE_GROUNDING;
      else process.env.RESILIENCE_NARRATIVE_GROUNDING = prevGrounding;
    }
  });
});
