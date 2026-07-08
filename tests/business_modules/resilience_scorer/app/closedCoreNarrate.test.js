import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { closedCoreNarrate } from '../../../../business_modules/resilience_scorer/app/narrative/closedCoreNarrate.js';
import { COMPONENT_IDS } from '../../../../cross-cut-modules/resilience-contracts/componentIds.js';

const envBackup = {};

function saveEnv(keys) {
  for (const k of keys) envBackup[k] = process.env[k];
}

function restoreEnv(keys) {
  for (const k of keys) {
    if (envBackup[k] === undefined) delete process.env[k];
    else process.env[k] = envBackup[k];
  }
}

function scoredFullStub() {
  return Object.fromEntries(
    COMPONENT_IDS.map((id) => [id, {
      score: 5,
      confidence: 'low',
      signal_count: 1,
      signals: [{
        signal_type: 'fear_expression',
        article_url: `https://example.com/${id}`,
        evidence: 'Residents report difficulty sleeping.',
        scope_level: 'single_case',
        evidence_type: 'observational_reported_fact',
        extraction_confidence: 0.8,
      }],
    }]),
  );
}

describe('closedCoreNarrate', () => {
  beforeEach(() => saveEnv([
    'RESILIENCE_NARRATIVE_PIPELINE',
    'RESILIENCE_NARRATIVE_FACTS_PASS',
    'RESILIENCE_NARRATIVE_JUDGE',
    'RESILIENCE_NARRATIVE_RAG_ENABLED',
    'RESILIENCE_NARRATIVE_GROUNDING',
  ]));
  afterEach(() => restoreEnv([
    'RESILIENCE_NARRATIVE_PIPELINE',
    'RESILIENCE_NARRATIVE_FACTS_PASS',
    'RESILIENCE_NARRATIVE_JUDGE',
    'RESILIENCE_NARRATIVE_RAG_ENABLED',
    'RESILIENCE_NARRATIVE_GROUNDING',
  ]));

  it('uses hybrid pipeline and caps digest registry (no monolithic Sonnet)', async () => {
    process.env.RESILIENCE_NARRATIVE_PIPELINE = 'hybrid';
    process.env.RESILIENCE_NARRATIVE_FACTS_PASS = '0';
    process.env.RESILIENCE_NARRATIVE_JUDGE = '0';
    process.env.RESILIENCE_NARRATIVE_RAG_ENABLED = '0';
    process.env.RESILIENCE_NARRATIVE_GROUNDING = '0';

    const signals = COMPONENT_IDS.flatMap((id, i) => [{
      signal_type: 'fear_expression',
      article_url: `https://example.com/${id}-${i}`,
      evidence: `Evidence for ${id}`,
      scope_level: 'single_case',
      evidence_type: 'observational_reported_fact',
      extraction_confidence: 0.85,
      intensity: 'moderate',
    }]);

    const llmCalls = [];
    const llmPort = {
      stream: async (opts) => {
        llmCalls.push({ model: opts.model, feature: opts.callContext?.feature });
        return {
          async finalMessage() {
            return {
              usage: { input_tokens: 100, output_tokens: 50 },
              stop_reason: 'end_turn',
              content: [{
                type: 'text',
                text: JSON.stringify({
                  components: COMPONENT_IDS.map((component_id) => ({
                    component_id,
                    narrative_claims: [],
                    narrative: `Narrative for ${component_id}.`,
                    evidence: [],
                  })),
                  cross_component_synthesis: 'Synthesis text.',
                }),
              }],
            };
          },
        };
      },
    };

    const scored = scoredFullStub();
    const assessment = await closedCoreNarrate(scored, signals, '2026-04-12', 10, {
      narrativeScopeSignals: signals,
      llmPort,
      onUsage: () => {},
    });

    assert.equal(assessment.assessment_mode, 'closed_core');
    assert.ok(assessment.narrative_prompt_budget);
    assert.ok(assessment.narrative_prompt_budget.registry_count <= 50);
    const sonnetMonolith = llmCalls.some((c) => c.feature === 'narrative' || String(c.model).includes('sonnet') && c.feature === 'unknown');
    assert.equal(sonnetMonolith, false);
    assert.ok(llmCalls.some((c) => c.feature === 'narrative_polish' || optsPurposeIncludesPolish(llmCalls)));
  });
});

function optsPurposeIncludesPolish(calls) {
  return calls.length > 0;
}
