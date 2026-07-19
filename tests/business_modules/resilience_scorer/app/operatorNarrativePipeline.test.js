import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  applyOperatorNarrativeToAssessment,
  applyOperatorNarrativePipeline,
} from '../../../../business_modules/resilience_scorer/app/assessment/operatorNarrativePipeline.js';
import { buildFullSignalDigest } from '../../../../business_modules/resilience_scorer/domain/services/narrative/buildFullSignalDigest.js';
import { buildSignalRefRegistry } from '../../../../business_modules/resilience_scorer/domain/services/narrativeGrounding/signalRefRegistry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  readFileSync(
    join(__dirname, '../../../fixtures/narrativeGroundingCases.json'),
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
      date: '2026-04-03',
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

  it('persists narrative_claims and resolves [S#] citations in hybrid mode', () => {
    process.env.RESILIENCE_NARRATIVE_PIPELINE = 'hybrid';
    const signals = fixtures.scored_components.narrative.signals;
    const registry = buildSignalRefRegistry({ narrative: { signals } });
    const assessment = {
      date: '2026-04-03',
      components: [{
        component_id: 'narrative',
        narrative: 'Agent thin template.',
      }],
    };
    const polish = {
      ...fixtures.good_narrative_output,
      components: [{
        ...fixtures.good_narrative_output.components[0],
        narrative: `${fixtures.good_narrative_output.components[0].narrative} [S1].`,
      }],
      cross_component_synthesis: 'Executive summary with [S1].',
    };

    applyOperatorNarrativeToAssessment(assessment, {
      polish,
      groundingScores: { byComponent: { narrative: { score: 0.9 } } },
      registry,
      mergedNarratives: {
        components: [{
          component_id: 'narrative',
          narrative_claims: fixtures.good_narrative_output.components[0].narrative_claims,
        }],
      },
    });

    assert.ok(assessment.components[0].narrative_claims?.length > 0);
    assert.doesNotMatch(assessment.components[0].narrative_operator, /\[S\d+\]/);
    assert.doesNotMatch(assessment.cross_component_synthesis_operator, /\[S\d+\]/);
    assert.ok(assessment.narrative_citation_registry?.entries?.length > 0);
  });

  it('backfills narrative_operator when polish omits component narrative', () => {
    process.env.RESILIENCE_NARRATIVE_PIPELINE = 'hybrid';
    const signals = fixtures.scored_components.narrative.signals;
    const registry = buildSignalRefRegistry({ narrative: { signals } });
    const assessment = {
      date: '2026-04-03',
      components: [{ component_id: 'narrative', narrative: 'Agent thin template.' }],
    };

    applyOperatorNarrativeToAssessment(assessment, {
      polish: { components: [], cross_component_synthesis: '' },
      groundingScores: { byComponent: {} },
      registry,
      mergedNarratives: {
        components: [{
          component_id: 'narrative',
          narrative_claims: fixtures.good_narrative_output.components[0].narrative_claims,
        }],
      },
    });

    assert.ok(assessment.components[0].narrative_operator);
    assert.match(assessment.components[0].narrative_operator, /sleep disruption/i);
    assert.ok(assessment.narrative_pipeline_degraded);
    assert.ok(assessment.narrative_pipeline_degrade_reasons?.includes('polish_miss_backfill'));
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

  it('buildFullSignalDigest passes evidence_basis through and collects component signals', () => {
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
    const evidenceBasis = {
      sufficiency: 'thin',
      signal_count: 2,
      distinct_articles: 2,
      distinct_sources: 2,
    };
    const evidenceFull = {
      information_communication: {
        score: null,
        evidence_basis: evidenceBasis,
        signals: [],
      },
    };

    const digest = buildFullSignalDigest(signals, evidenceFull);

    assert.deepEqual(digest.information_communication.evidence_basis, evidenceBasis);
    assert.equal(digest.information_communication.score, undefined);
    assert.ok(digest.information_communication.signals.length >= 1);
    assert.equal(
      digest.information_communication.signal_count,
      digest.information_communication.signals.length,
    );
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
      narrativeScoringContext: { narrative: { score: null, evidence_basis: { sufficiency: 'thin' } } },
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

  it('falls back to claim-derived operator narrative when hybrid pipeline throws', async (t) => {
    // Mock setTimeout so the LLM retry backoff (5s + 10s) does not run in real time.
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const assessment = {
      components: [{
        component_id: 'narrative',
        narrative: 'Agent narrative.',
        narrative_claims: fixtures.good_narrative_output.components[0].narrative_claims,
      }],
    };

    const pipelinePromise = applyOperatorNarrativePipeline({
      assessment,
      narrativeScopeSignals: fixtures.scored_components.narrative.signals,
      llmPort: {
        stream: async () => {
          throw new Error('LLM unavailable');
        },
      },
    });

    let settled = false;
    pipelinePromise.then(() => { settled = true; }, () => { settled = true; });
    while (!settled) {
      await new Promise((resolve) => setImmediate(resolve));
      t.mock.timers.tick(90000);
    }
    await pipelinePromise;

    assert.equal(assessment.components[0].narrative_operator, 'Agent narrative.');
    assert.ok(assessment.components[0].evidence_operator?.length > 0);
  });
});
