import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  applyOperatorNarrativeToAssessment,
  applyOperatorNarrativePipeline,
} from '../../../../business_modules/resilience/app/operatorNarrativePipeline.js';
import { buildFullSignalDigest } from '../../../../business_modules/resilience/domain/services/buildFullSignalDigest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  readFileSync(
    join(__dirname, '../../../../analyst/tuning/adversarial/narrativeGroundingCases.json'),
    'utf8',
  ),
);

function buildMockLlmPort(responses) {
  let callIndex = 0;
  return {
    stream: async () => {
      const payload = responses[callIndex] ?? responses[responses.length - 1];
      callIndex += 1;
      return {
        finalMessage: async () => ({
          content: [{ type: 'text', text: JSON.stringify(payload) }],
          usage: { input_tokens: 80, output_tokens: 120 },
        }),
        [Symbol.asyncIterator]: async function* () {},
      };
    },
  };
}

describe('operatorNarrativePipeline', () => {
  let prevPipeline;
  let prevRag;

  beforeEach(() => {
    prevPipeline = process.env.RESILIENCE_NARRATIVE_PIPELINE;
    prevRag = process.env.RESILIENCE_NARRATIVE_RAG_ENABLED;
    process.env.RESILIENCE_NARRATIVE_PIPELINE = 'hybrid';
    process.env.RESILIENCE_NARRATIVE_RAG_ENABLED = '0';
  });

  afterEach(() => {
    if (prevPipeline === undefined) delete process.env.RESILIENCE_NARRATIVE_PIPELINE;
    else process.env.RESILIENCE_NARRATIVE_PIPELINE = prevPipeline;
    if (prevRag === undefined) delete process.env.RESILIENCE_NARRATIVE_RAG_ENABLED;
    else process.env.RESILIENCE_NARRATIVE_RAG_ENABLED = prevRag;
  });

  it('applyOperatorNarrativeToAssessment sets narrative_operator in hybrid mode', () => {
    process.env.RESILIENCE_NARRATIVE_PIPELINE = 'hybrid';
    const assessment = {
      components: [{
        component_id: 'narrative',
        narrative: 'Agent thin template.',
        narrative_claims: [],
      }],
    };

    applyOperatorNarrativeToAssessment(assessment, {
      polish: fixtures.good_narrative_output,
      groundingScores: { byComponent: { narrative: { score: 0.9 } } },
    });

    assert.match(assessment.components[0].narrative_operator, /sleep disruption/i);
    assert.equal(assessment.components[0].narrative, 'Agent thin template.');
    assert.deepEqual(
      assessment.components[0].evidence_operator,
      fixtures.good_narrative_output.components[0].evidence,
    );
    assert.equal(assessment.narrative_pipeline_mode, 'hybrid');
    assert.ok(assessment.cross_component_synthesis_operator);
  });

  it('legacy mode overwrites agent narrative on disk', () => {
    process.env.RESILIENCE_NARRATIVE_PIPELINE = 'legacy';
    const assessment = {
      components: [{
        component_id: 'narrative',
        narrative: 'Agent narrative.',
      }],
      cross_component_synthesis: 'Agent synthesis.',
    };

    applyOperatorNarrativeToAssessment(assessment, {
      polish: fixtures.good_narrative_output,
      groundingScores: { byComponent: {} },
    });

    assert.match(assessment.components[0].narrative, /sleep disruption/i);
    assert.ok(assessment.cross_component_synthesis.includes('- narrative:'));
  });

  it('buildFullSignalDigest prefers digital-inclusive scoring context over field-only', () => {
    const pboSig = {
      source_type: 'pbo',
      signal_type: 'information_clarity',
      evidence: 'Field guidance continues.',
      article_url: 'https://example.com/field',
    };
    const newsSig = {
      source_type: 'news',
      signal_type: 'information_clarity',
      evidence: 'News reports ongoing concern.',
      article_url: 'https://example.com/news',
    };
    const signals = [pboSig, newsSig];
    const fieldOnlyScored = {
      information_communication: {
        score: 4,
        score_raw: 4,
        suppression_delta: 0,
        signals: [],
      },
    };
    const digitalInclusiveScored = {
      information_communication: {
        score: 6,
        score_raw: 7,
        suppression_delta: -1,
        source_cap_binding: true,
        signals: [],
      },
    };

    const fromField = buildFullSignalDigest(signals, fieldOnlyScored);
    const fromInclusive = buildFullSignalDigest(signals, digitalInclusiveScored);

    assert.equal(fromField.information_communication.score, 4);
    assert.equal(fromInclusive.information_communication.score, 6);
    assert.equal(fromInclusive.information_communication.source_cap_binding, true);
    assert.ok(fromInclusive.information_communication.signals.length >= 1);
  });

  it('applyOperatorNarrativePipeline stamps agent mode and finalizes surface', async () => {
    process.env.RESILIENCE_NARRATIVE_PIPELINE = 'agent';
    const assessment = {
      components: [{ component_id: 'narrative', narrative: 'Agent prose unchanged.' }],
    };
    const signals = fixtures.scored_components.narrative.signals;

    await applyOperatorNarrativePipeline({
      assessment,
      narrativeScopeSignals: signals,
      llmPort: buildMockLlmPort([]),
    });

    assert.equal(assessment.narrative_pipeline_mode, 'agent');
    assert.equal(assessment.components[0].narrative_operator, 'Agent prose unchanged.');
  });

  it('applyOperatorNarrativePipeline accepts partition metadata without error', async () => {
    process.env.RESILIENCE_NARRATIVE_PIPELINE = 'agent';
    const assessment = {
      components: [{ component_id: 'narrative', narrative: 'Agent prose unchanged.' }],
    };
    const signals = fixtures.scored_components.narrative.signals;

    await applyOperatorNarrativePipeline({
      assessment,
      narrativeScopeSignals: signals,
      narrativeScoringContext: { narrative: { score: 5, score_raw: 6 } },
      scoringPartition: {
        partitionApplied: true,
        assessmentMode: 'field_anchor_only',
        quarantinedSignals: [{ source_type: 'news' }],
      },
      quarantinedDigital: { count: 1, reason: 'digital_darkness' },
      signalsScoringUsed: 2,
      llmPort: buildMockLlmPort([]),
    });

    assert.equal(assessment.narrative_pipeline_mode, 'agent');
  });

  it('runs end-to-end with mocked LLM and sets operator fields', async () => {
    const factsOutput = {
      components: [{
        component_id: 'narrative',
        claims: fixtures.good_narrative_output.components[0].narrative_claims,
      }],
    };
    const judgeOutput = {
      verdicts: [
        { i: 0, entailed: true, invented_relation: false },
        { i: 1, entailed: true, invented_relation: false },
      ],
    };

    const llmPort = {
      stream: async () => {
        const idx = llmPort._i ?? 0;
        llmPort._i = idx + 1;
        let payload;
        if (idx === 0) payload = factsOutput;
        else if (idx === 1) payload = judgeOutput;
        else payload = fixtures.good_narrative_output;
        return {
          finalMessage: async () => ({
            content: [{ type: 'text', text: JSON.stringify(payload) }],
            usage: { input_tokens: 50, output_tokens: 80 },
          }),
          [Symbol.asyncIterator]: async function* () {},
        };
      },
    };

    const assessment = {
      components: [{
        component_id: 'narrative',
        narrative: 'Agent narrative.',
        narrative_claims: fixtures.good_narrative_output.components[0].narrative_claims,
      }],
    };

    await applyOperatorNarrativePipeline({
      assessment,
      narrativeScopeSignals: fixtures.scored_components.narrative.signals,
      reportDate: '2026-04-03',
      llmPort,
    });

    assert.ok(assessment.components[0].narrative_operator);
    assert.ok(assessment.cross_component_synthesis_operator);
  });
});
