import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runDeterministicAssessment } from '../../../business_modules/resilience_assessment/app/runDeterministicAssessment.js';
import { COMPONENT_IDS } from '../../../cross-cut-modules/resilience-contracts/componentIds.js';

const signal = {
  article_index: 1,
  article_url: 'https://example.com/a',
  signal_type: 'information_clarity',
  evidence_type: 'named_institutional_fact',
  evidence: 'Official channel published clear instructions.',
  scope_level: 'single_case',
  component_id: 'information_environment',
};

function _scoredStub() {
  const out = {};
  for (const id of COMPONENT_IDS) {
    out[id] = {
      score: 5,
      confidence: 'medium',
      evidence_mass: 2,
      signal_count: 1,
    };
  }
  return out;
}

function epistemicProfile() {
  const by_component = {};
  for (const id of COMPONENT_IDS) {
    by_component[id] = {
      evidence_mass: 2,
      thin_evidence: false,
      contested: false,
    };
  }
  return { by_component, report_date: '2026-03-22' };
}

describe('runDeterministicAssessment', () => {
  it('returns assessment with instruments for all components', async () => {
    const result = await runDeterministicAssessment({
      signals: [signal],
      epistemicProfile: epistemicProfile(),
      reportDate: '2026-03-22',
      reportScopeId: 'national',
      totalArticles: 1,
      degradeReason: 'forced_deterministic',
    });

    assert.equal(result.isEmpty, false);
    assert.equal(result.traceId, null);
    assert.equal(result.assessment.degrade_reason, 'forced_deterministic');
    assert.equal(result.assessment.assessment_degraded.mode, 'deterministic');
    assert.equal(result.assessment.components.length, COMPONENT_IDS.length);
    for (const comp of result.assessment.components) {
      assert.ok(comp.component_id);
      assert.ok(comp.instrument, `instrument missing for ${comp.component_id}`);
      assert.ok(comp.severity);
    }
    assert.equal(result.assessment.synthesis_mode, 'deterministic');
    assert.equal(result.assessment.agent_trace_id, null);
  });

  it('returns isEmpty when no signals and no epistemic evidence', async () => {
    const result = await runDeterministicAssessment({
      signals: [],
      epistemicProfile: { by_component: {} },
      reportDate: '2026-03-22',
      degradeReason: 'agent_failed',
    });
    assert.equal(result.isEmpty, true);
    assert.equal(result.assessment, null);
  });
});
