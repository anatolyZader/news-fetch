import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  DISPLAY_VIEWS,
  resolveDisplayView,
  deriveInstrumentState,
  operatorAssessmentSummary,
  redactAssessmentForView,
  redactScoreBySource,
  redactReportPayload,
  narrativeIncludesScores,
} from '../../../../../business_modules/resilience_scorer/domain/services/operator/assessmentDisplayTier.js';
import {
  canViewAnalystDisplay,
  resetUserAccessCache,
  setUserAccessConfigForTests,
} from '../../../../../cross-cut-modules/auth/userAccess.js';

describe('assessmentDisplayTier', () => {
  let prevEmails;
  let prevNarrativeScores;

  beforeEach(() => {
    prevEmails = process.env.RESILIENCE_ANALYST_EMAILS;
    prevNarrativeScores = process.env.RESILIENCE_NARRATIVE_INCLUDE_SCORES;
    resetUserAccessCache();
    setUserAccessConfigForTests({ operatorDistrictEnforcementEnabled: false, users: [] });
  });

  afterEach(() => {
    if (prevEmails === undefined) delete process.env.RESILIENCE_ANALYST_EMAILS;
    else process.env.RESILIENCE_ANALYST_EMAILS = prevEmails;
    if (prevNarrativeScores === undefined) delete process.env.RESILIENCE_NARRATIVE_INCLUDE_SCORES;
    else process.env.RESILIENCE_NARRATIVE_INCLUDE_SCORES = prevNarrativeScores;
    resetUserAccessCache();
  });

  it('resolveDisplayView defaults to operator', () => {
    assert.equal(resolveDisplayView({}), DISPLAY_VIEWS.operator);
    assert.equal(resolveDisplayView({ queryView: 'operator' }), DISPLAY_VIEWS.operator);
  });

  it('resolveDisplayView grants analyst only when canViewAnalyst is true', () => {
    assert.equal(
      resolveDisplayView({ queryView: 'analyst', canViewAnalyst: true }),
      DISPLAY_VIEWS.analyst,
    );
    assert.equal(
      resolveDisplayView({ queryView: 'analyst', canViewAnalyst: false }),
      DISPLAY_VIEWS.operator,
    );
  });

  it('canViewAnalystDisplay mirrors allowlist', () => {
    process.env.RESILIENCE_ANALYST_EMAILS = 'a@b.c';
    assert.equal(canViewAnalystDisplay('a@b.c'), true);
    assert.equal(canViewAnalystDisplay('x@y.z'), false);
    assert.equal(canViewAnalystDisplay(''), false);
  });

  it('deriveInstrumentState maps evidence mass to sufficiency', () => {
    assert.equal(deriveInstrumentState({ evidence_mass: 1 }).evidence_sufficiency, 'thin');
    assert.equal(deriveInstrumentState({ evidence_mass: 2 }).evidence_sufficiency, 'moderate');
    assert.equal(deriveInstrumentState({ evidence_mass: 5 }).evidence_sufficiency, 'adequate');
    assert.equal(
      deriveInstrumentState({ polarization: 0.8, evidence_mass: 5 }).contested,
      true,
    );
    assert.equal(
      deriveInstrumentState({ delta_flag: 'significant' }).significant_delta,
      true,
    );
  });

  it('deriveInstrumentState exposes raw metrics on instrument', () => {
    const inst = deriveInstrumentState({
      evidence_mass: 5.2,
      polarization: 0.72,
      certainty: 0.8,
      source_diversity: 3,
      source_cap_binding: true,
      suppression_delta: 1.2,
      distinct_article_count: 4,
      signal_count: 6,
    });
    assert.equal(inst.evidence_mass, 5.2);
    assert.equal(inst.polarization_band, 'contested');
    assert.equal(inst.suppression_active, true);
    assert.equal(inst.distinct_article_count, 4);
  });

  it('deriveInstrumentState includes analyst top_contributors only for analyst view', () => {
    const comp = {
      evidence_mass: 5,
      signals: [{ signal_type: 'rumor_spread', evidence: 'x', _contribution_raw: 1.2 }],
    };
    const op = deriveInstrumentState(comp, { view: 'operator' });
    const an = deriveInstrumentState(comp, { view: 'analyst' });
    assert.equal(op.top_contributors, undefined);
    assert.equal(an.top_contributors?.length, 1);
  });

  it('operatorAssessmentSummary has no /10', () => {
    const line = operatorAssessmentSummary({
      report_scope: { label: 'National' },
      components: [
        { evidence_mass: 5, confidence: 'high' },
        { evidence_mass: 1, confidence: 'low' },
      ],
    });
    assert.ok(!line.includes('/10'));
    assert.match(line, /adequate evidence: 1\/2/);
  });

  it('redactAssessmentForView strips scores for analyst too', () => {
    const assessment = {
      date: '2026-05-10',
      overall_resilience_score: 7,
      components: [{
        component_id: 'narrative',
        score: 8,
        narrative: 'text',
        evidence_mass: 5,
        confidence: 'high',
      }],
    };
    const out = redactAssessmentForView(assessment, DISPLAY_VIEWS.analyst);
    assert.equal(out.display_view, DISPLAY_VIEWS.analyst);
    assert.equal(out.overall_resilience_score, undefined);
    assert.equal(out.components[0].score, undefined);
    assert.equal(out.components[0].instrument.evidence_sufficiency, 'adequate');
  });

  it('redactAssessmentForView strips scores for operator', () => {
    const assessment = {
      date: '2026-05-10',
      overall_resilience_score: 7,
      components: [{
        component_id: 'narrative',
        score: 8,
        score_low: 6,
        score_high: 9,
        narrative: 'text',
        evidence: ['e1'],
        evidence_mass: 5,
        polarization: 0.2,
        confidence: 'high',
        facets: [{ id: 'x', score: 7 }],
      }],
      norris_capacities: [{ id: 'robustness', score: 0.8 }],
    };
    const out = redactAssessmentForView(assessment, DISPLAY_VIEWS.operator);
    assert.equal(out.display_view, DISPLAY_VIEWS.operator);
    assert.equal(out.overall_resilience_score, undefined);
    assert.equal(out.components[0].score, undefined);
    assert.equal(out.components[0].narrative, 'text');
    assert.equal(out.components[0].instrument.evidence_sufficiency, 'adequate');
    assert.equal(out.components[0].facets[0].score, undefined);
    assert.equal(out.norris_capacities[0].score, undefined);
  });


  it('redactAssessmentForView passes through narrative for analyst', () => {
    const assessment = { overall_resilience_score: 5, components: [{ component_id: 'n', score: 6, narrative: 'keep' }] };
    const out = redactAssessmentForView(assessment, DISPLAY_VIEWS.analyst);
    assert.equal(out.components[0].narrative, 'keep');
    assert.equal(out.components[0].score, undefined);
  });

  it('redactAssessmentForView prefers narrative_operator for operator view', () => {
    const assessment = {
      cross_component_synthesis: 'Agent synthesis.',
      cross_component_synthesis_operator: 'Operator synthesis.',
      components: [{
        component_id: 'narrative',
        narrative: 'Agent narrative.',
        narrative_operator: 'Operator narrative.',
      }],
    };
    const out = redactAssessmentForView(assessment, DISPLAY_VIEWS.operator);
    assert.equal(out.components[0].narrative, 'Operator narrative.');
    assert.equal(out.cross_component_synthesis, 'Operator synthesis.');
    assert.equal(out.components[0].narrative_operator, undefined);
    assert.equal(out.cross_component_synthesis_operator, undefined);
  });

  it('redactAssessmentForView prefers evidence_operator for operator view', () => {
    const assessment = {
      components: [{
        component_id: 'narrative',
        evidence: ['Agent evidence.'],
        evidence_operator: ['Operator evidence.'],
      }],
    };
    const out = redactAssessmentForView(assessment, DISPLAY_VIEWS.operator);
    assert.deepEqual(out.components[0].evidence, ['Operator evidence.']);
    assert.equal(out.components[0].evidence_operator, undefined);
  });

  it('redactAssessmentForView prefers structured evidence_operator for operator view', () => {
    const assessment = {
      components: [{
        component_id: 'narrative',
        evidence_operator: ['- bullet'],
        evidence_operator_structured: [{
          text: 'Operator claim.',
          source_type: 'press',
          article_source: 'ynet.co.il',
          markdown: '- Operator claim. [source](https://ynet.co.il/x)',
        }],
      }],
    };
    const out = redactAssessmentForView(assessment, DISPLAY_VIEWS.operator);
    assert.equal(out.components[0].evidence.length, 1);
    assert.equal(out.components[0].evidence[0].source_type, 'press');
    assert.equal(out.components[0].evidence_operator_structured, undefined);
  });

  it('redactAssessmentForView strips operator pipeline caveats', () => {
    const assessment = {
      investigation_summary: { synthesis_mode: 'deterministic' },
      components: [{
        component_id: 'narrative',
        narrative: 'Prose.',
        data_quality_caveat: 'Source cap on ynet.',
      }],
    };
    const out = redactAssessmentForView(assessment, DISPLAY_VIEWS.operator);
    assert.equal(out.investigation_summary, undefined);
    assert.equal(out.components[0].data_quality_caveat, undefined);
  });

  it('redactAssessmentForView keeps agent narrative for analyst when operator field present', () => {
    const assessment = {
      components: [{
        component_id: 'narrative',
        narrative: 'Agent narrative.',
        narrative_operator: 'Operator narrative.',
      }],
    };
    const out = redactAssessmentForView(assessment, DISPLAY_VIEWS.analyst);
    assert.equal(out.components[0].narrative, 'Agent narrative.');
    assert.equal(out.components[0].narrative_operator, 'Operator narrative.');
  });

  it('redactAssessmentForView preserves operator display fields and hides analyst diagnostics', () => {
    const assessment = {
      components: [{
        component_id: 'information_communication',
        operator_display_state: 'specialist_skipped',
        operator_state_reason: 'tier_c_not_in_focus',
        operator_state_inputs: { claims_count: 0 },
        coverage: { scoring_used: 57, quarantined: 20, claims: 0 },
        evidence_usage_state: 'mixed',
        assessment_state: 'specialist_skipped',
        analyst_flags: ['tier_c_skipped'],
        narrative: 'keep',
      }],
      component_diagnostics: { information_communication: { claims_count: 0 } },
    };
    const out = redactAssessmentForView(assessment, DISPLAY_VIEWS.operator);
    const comp = out.components[0];
    assert.equal(comp.operator_display_state, 'specialist_skipped');
    assert.equal(comp.coverage.scoring_used, 57);
    assert.equal(comp.operator_state_inputs, undefined);
    assert.equal(comp.analyst_flags, undefined);
    assert.equal(out.component_diagnostics, undefined);
  });

  it('redactAssessmentForView exposes national_context_signals for operator', () => {
    const assessment = {
      components: [],
      macro_signals: [
        { signal_type: 'macro_framing', evidence: 'National TV coverage of war.' },
      ],
    };
    const out = redactAssessmentForView(assessment, DISPLAY_VIEWS.operator);
    assert.equal(out.macro_signals, undefined);
    assert.equal(out.national_context_signals.length, 1);
    assert.equal(out.national_context_summary.count, 1);
    assert.equal(out.national_context_signals[0].signal_type, 'macro_framing');
  });

  it('redactScoreBySource keeps signals only for operator', () => {
    const raw = {
      news: {
        narrative: { score: 7, signals: [{ signal_type: 'x' }], evidence_mass: 3 },
      },
    };
    const out = redactScoreBySource(raw, DISPLAY_VIEWS.operator);
    assert.equal(out.news.narrative.score, undefined);
    assert.equal(out.news.narrative.signals.length, 1);
    assert.equal(out.news.narrative.instrument.evidence_sufficiency, 'moderate');
  });

  it('redactReportPayload applies assessment and score_by_source', () => {
    const payload = {
      assessment: { overall_resilience_score: 6, components: [] },
      score_by_source: { news: { narrative: { score: 5, signals: [] } } },
    };
    const out = redactReportPayload(payload, DISPLAY_VIEWS.operator);
    assert.equal(out.display_view, DISPLAY_VIEWS.operator);
    assert.equal(out.assessment.overall_resilience_score, undefined);
    assert.equal(out.score_by_source.news.narrative.score, undefined);
  });

  it('redactReportPayload prefers markdown_brief for operator', () => {
    const out = redactReportPayload({
      assessment: { components: [] },
      markdown: '# Full scores',
      markdown_brief: '# Brief only',
    }, DISPLAY_VIEWS.operator);
    assert.equal(out.markdown, '# Brief only');
  });

  it('narrativeIncludesScores defaults false', () => {
    delete process.env.RESILIENCE_NARRATIVE_INCLUDE_SCORES;
    assert.equal(narrativeIncludesScores(), false);
    process.env.RESILIENCE_NARRATIVE_INCLUDE_SCORES = 'true';
    assert.equal(narrativeIncludesScores(), true);
  });
});
