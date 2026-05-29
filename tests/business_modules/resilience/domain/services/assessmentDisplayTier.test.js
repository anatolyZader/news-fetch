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
} from '../../../../../business_modules/resilience/domain/services/assessmentDisplayTier.js';
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

  it('resolveDisplayView grants analyst only for allowlisted email', () => {
    process.env.RESILIENCE_ANALYST_EMAILS = 'Analyst@Example.com, other@test.io';
    assert.equal(
      resolveDisplayView({ queryView: 'analyst', userEmail: 'analyst@example.com' }),
      DISPLAY_VIEWS.analyst,
    );
    assert.equal(
      resolveDisplayView({ queryView: 'analyst', userEmail: 'stranger@test.io' }),
      DISPLAY_VIEWS.operator,
    );
    assert.equal(
      resolveDisplayView({ queryView: 'analyst', userEmail: null }),
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

  it('redactAssessmentForView summarizes macro_signals for operator', () => {
    const assessment = {
      components: [],
      macro_signals: [
        { signal_type: 'macro_framing', evidence: 'National TV coverage of war.' },
      ],
    };
    const out = redactAssessmentForView(assessment, DISPLAY_VIEWS.operator);
    assert.equal(out.macro_signals, undefined);
    assert.equal(out.macro_signals_summary.count, 1);
    assert.deepEqual(out.macro_signals_summary.signal_types, ['macro_framing']);
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
