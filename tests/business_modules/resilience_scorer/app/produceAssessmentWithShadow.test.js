import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { produceAssessmentWithShadow } from '../../../../business_modules/resilience_scorer/app/assessment/produceAssessmentWithShadow.js';
import { COMPONENT_IDS } from '../../../../business_modules/resilience_scorer/domain/contracts/componentIds.js';
const signal = {
  article_index: 1,
  article_url: 'https://example.com/a',
  signal_type: 'information_clarity',
  evidence_type: 'named_institutional_fact',
  evidence: 'Official channel published clear instructions.',
  scope_level: 'single_case',
  component_id: 'information_environment',
};

function scoredStub() {
  const out = {};
  for (const id of COMPONENT_IDS) {
    out[id] = { score: 5, confidence: 'medium', evidence_mass: 2, signal_count: 1 };
  }
  return out;
}

describe('produceAssessmentWithShadow', () => {
  let prevForce;
  let prevAgent;

  before(() => {
    prevForce = process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC;
    prevAgent = process.env.RESILIENCE_ASSESSMENT_AGENT;
    process.env.RESILIENCE_CLOSED_CORE_ASSESS = '0';
  });

  after(() => {
    if (prevForce === undefined) delete process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC;
    else process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC = prevForce;
    if (prevAgent === undefined) delete process.env.RESILIENCE_ASSESSMENT_AGENT;
    else process.env.RESILIENCE_ASSESSMENT_AGENT = prevAgent;
    delete process.env.RESILIENCE_CLOSED_CORE_ASSESS;
  });

  it('uses deterministic degrade when force flag set', async () => {
    process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC = '1';
    const assessment = await produceAssessmentWithShadow({
      targetDate: '2026-03-22',
      reportScopeId: 'national',
      signalsForScoring: [signal],
      scopedSignals: [signal],
      scoredFull: scoredStub(),
      scopedTotalArticles: 1,
      dataVoid: null,
      assessmentMode: 'normal',
      epistemicStatus: null,
      reportsDir: mkdtempSync(join(tmpdir(), 'pas-')),
    });
    assert.equal(assessment.synthesis_mode, 'deterministic');
    assert.equal(assessment.assessment_degraded.mode, 'deterministic');
    assert.equal(assessment.agent_trace_id, null);
  });

  it('uses deterministic degrade when daily budget exceeded', async () => {
    delete process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC;
    process.env.RESILIENCE_ASSESSMENT_AGENT = '1';
    const assessment = await produceAssessmentWithShadow({
      targetDate: '2026-03-22',
      reportScopeId: 'national',
      signalsForScoring: [signal],
      scopedSignals: [signal],
      scoredFull: scoredStub(),
      scopedTotalArticles: 1,
      dataVoid: null,
      assessmentMode: 'normal',
      epistemicStatus: null,
      reportsDir: mkdtempSync(join(tmpdir(), 'pas-budget-')),
      dailyBudgetExceeded: true,
    });
    assert.equal(assessment.degrade_reason, 'budget_exceeded');
    assert.equal(assessment.synthesis_mode, 'deterministic');
  });

  it('loads cached report when scores empty', async () => {
    const reportsDir = mkdtempSync(join(tmpdir(), 'pas-cache-'));
    mkdirSync(reportsDir, { recursive: true });
    const cachedAssessment = {
      date: '2026-03-21',
      components: COMPONENT_IDS.map((id) => ({
        component_id: id,
        severity: 'moderate',
        narrative: 'cached',
        instrument: { thin_evidence_instrument: 'adequate' },
      })),
      cross_component_synthesis: 'cached synthesis',
    };
    writeFileSync(
      join(reportsDir, 'resilience-report-data-2026-03-21-run-1000.json'),
      JSON.stringify({ assessment: cachedAssessment }),
    );

    const assessment = await produceAssessmentWithShadow({
      targetDate: '2026-03-22',
      reportScopeId: 'national',
      signalsForScoring: [],
      scopedSignals: [],
      scoredFull: {},
      scopedTotalArticles: 0,
      dataVoid: null,
      assessmentMode: 'normal',
      epistemicStatus: null,
      reportsDir,
      dailyBudgetExceeded: true,
    });

    assert.equal(assessment.assessment_degraded.mode, 'cached');
    assert.equal(assessment.assessment_degraded.cached_date, '2026-03-21');
  });
});
