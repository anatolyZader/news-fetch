import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'assert';

import { applyUserNarrativePipeline } from '../../../../business_modules/resilience_scorer/app/assessment/userNarrativePipeline.js';
import { SCOPE_MARKER_PREFIX } from '../../../../business_modules/resilience_scorer/domain/services/narrativeGrounding/scopeSegregation.js';

/**
 * Before repair, one misplaced out-of-scope sentence cost a component its entire
 * LLM narrative: enforceScopeSegregation blanked narrative_user and the
 * deterministic claim stack took its place. north 2026-04-03 lost three
 * components that way. Repair re-asks once and keeps the prose when it complies.
 */
const CONTEXT_SIGNAL = {
  signal_type: 'early_warning_system_failure',
  signalProvenance: 'narrative_national_context',
  source_type: 'news',
  article_url: 'https://national.example/1',
  evidence: 'Alerts failed in Ashdod and Ashkelon without advance warning',
};

const LOCAL_SIGNAL = {
  signal_type: 'information_clarity',
  signalProvenance: 'source_assigned',
  source_type: 'pbo',
  article_source: 'pbo-Rama',
  article_url: 'https://local.example/1',
  evidence: 'Residents receive guidance from the council',
};

const VIOLATING = 'Residents receive council guidance. Alerts failed without advance warning.';
const REPAIRED = `Residents receive council guidance. ${SCOPE_MARKER_PREFIX} alerts failed without advance warning.`;

/**
 * Facts → judge → polish → (repair). The polish call answers with prose that
 * buries national evidence in the body; the repair call answers compliantly.
 */
function buildPort({ repairAnswer, calls }) {
  return {
    stream: async (params) => {
      const feature = params?.callContext?.feature;
      const purpose = params?.callContext?.purpose ?? '';
      calls.push(purpose);

      let payload;
      if (feature === 'narrative_judge') {
        payload = { verdicts: [] };
      } else if (feature === 'narrative_polish') {
        const isRepair = purpose.includes('scope repair');
        payload = {
          components: [{
            component_id: 'information_communication',
            narrative: isRepair ? repairAnswer : VIOLATING,
            evidence: [LOCAL_SIGNAL.evidence],
          }],
          cross_component_synthesis: '- synthesis',
        };
      } else {
        payload = {
          components: [{
            component_id: 'information_communication',
            claims: [
              { text: 'Residents receive council guidance.', signal_refs: ['information_clarity@url:https://local.example/1'], relation: 'parallel' },
              { text: 'Alerts failed without advance warning.', signal_refs: ['early_warning_system_failure@url:https://national.example/1'], relation: 'parallel' },
            ],
          }],
        };
      }
      return {
        finalMessage: async () => ({
          content: [{ type: 'text', text: JSON.stringify(payload) }],
          usage: { input_tokens: 20, output_tokens: 40 },
        }),
        [Symbol.asyncIterator]: async function* () {},
      };
    },
  };
}

async function run({ repairAnswer, repairEnv }) {
  const calls = [];
  const assessment = {
    date: '2026-04-03',
    components: [{ component_id: 'information_communication' }],
  };
  const prev = process.env.RESILIENCE_NARRATIVE_SCOPE_REPAIR;
  if (repairEnv === undefined) delete process.env.RESILIENCE_NARRATIVE_SCOPE_REPAIR;
  else process.env.RESILIENCE_NARRATIVE_SCOPE_REPAIR = repairEnv;
  try {
    await applyUserNarrativePipeline({
      assessment,
      narrativeScopeSignals: [LOCAL_SIGNAL, CONTEXT_SIGNAL],
      llmPort: buildPort({ repairAnswer, calls }),
    });
  } finally {
    if (prev === undefined) delete process.env.RESILIENCE_NARRATIVE_SCOPE_REPAIR;
    else process.env.RESILIENCE_NARRATIVE_SCOPE_REPAIR = prev;
  }
  return { assessment, calls, comp: assessment.components[0] };
}

describe('scope repair in the narrative pipeline', () => {
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

  it('keeps LLM prose when the re-ask complies', async () => {
    const { assessment, calls, comp } = await run({ repairAnswer: REPAIRED });

    assert.ok(
      calls.some((c) => c.includes('scope repair')),
      `expected a scope repair call, saw: ${JSON.stringify(calls)}`,
    );
    assert.ok(
      String(comp.narrative_user ?? '').includes('Residents receive council guidance'),
      `repaired prose must survive, got: ${comp.narrative_user}`,
    );
    assert.deepEqual(assessment.narrative_scope_repairs, ['information_communication']);
    assert.ok(
      !(assessment.narrative_pipeline_degrade_reasons ?? []).some((r) => r.startsWith('scope_repair_failed')),
      'a successful repair is not a failure',
    );
  });

  it('falls back and records the failure when the re-ask still violates', async () => {
    const { assessment, comp } = await run({ repairAnswer: VIOLATING });

    assert.ok(
      (assessment.narrative_pipeline_degrade_reasons ?? [])
        .includes('scope_repair_failed:information_communication'),
      `expected a recorded failure, got: ${JSON.stringify(assessment.narrative_pipeline_degrade_reasons)}`,
    );
    assert.equal(assessment.narrative_scope_repairs, undefined);
    assert.ok(
      (comp.narrative_claims ?? []).some((c) => String(c.text).startsWith(SCOPE_MARKER_PREFIX)),
      'the discard path must still push context claims behind the marker',
    );
  });

  it('skips the re-ask entirely when the kill-switch is set', async () => {
    const { calls, assessment } = await run({ repairAnswer: REPAIRED, repairEnv: '0' });

    assert.ok(
      !calls.some((c) => c.includes('scope repair')),
      `no repair call expected, saw: ${JSON.stringify(calls)}`,
    );
    assert.equal(assessment.narrative_scope_repairs, undefined);
  });
});
