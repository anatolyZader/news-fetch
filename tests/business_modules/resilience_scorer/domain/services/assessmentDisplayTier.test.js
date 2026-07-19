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
} from '../../../../../business_modules/resilience_scorer/domain/services/operator/assessmentDisplayTier.js';
import {
  canViewAnalystDisplay,
  resetUserAccessCache,
  setUserAccessConfigForTests,
} from '../../../../../cross-cut-modules/auth/userAccess.js';

describe('assessmentDisplayTier', () => {
  let prevEmails;

  beforeEach(() => {
    prevEmails = process.env.RESILIENCE_ANALYST_EMAILS;
    resetUserAccessCache();
    setUserAccessConfigForTests({ operatorDistrictEnforcementEnabled: false, users: [] });
  });

  afterEach(() => {
    if (prevEmails === undefined) delete process.env.RESILIENCE_ANALYST_EMAILS;
    else process.env.RESILIENCE_ANALYST_EMAILS = prevEmails;
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

  it('deriveInstrumentState maps evidence_basis sufficiency to certainty band', () => {
    assert.equal(
      deriveInstrumentState({ evidence_basis: { sufficiency: 'thin' } }).evidence_sufficiency,
      'thin',
    );
    assert.equal(
      deriveInstrumentState({ evidence_basis: { sufficiency: 'thin' } }).certainty_band,
      'low',
    );
    assert.equal(
      deriveInstrumentState({ evidence_basis: { sufficiency: 'moderate' } }).certainty_band,
      'medium',
    );
    assert.equal(
      deriveInstrumentState({ evidence_basis: { sufficiency: 'adequate' } }).certainty_band,
      'high',
    );
    // No basis at all falls back to moderate; insufficient_data confidence → none/low.
    assert.equal(deriveInstrumentState({}).evidence_sufficiency, 'moderate');
    const none = deriveInstrumentState({ confidence: 'insufficient_data' });
    assert.equal(none.evidence_sufficiency, 'none');
    assert.equal(none.certainty_band, 'low');
    assert.equal(none.shows_assessment, false);
  });

  it('deriveInstrumentState maps balance to polarization/contested flags', () => {
    const contested = deriveInstrumentState({
      evidence_basis: { sufficiency: 'adequate', balance: 'contested' },
    });
    assert.equal(contested.contested, true);
    assert.equal(contested.contested_evidence, true);
    assert.equal(contested.polarization_band, 'contested');

    assert.equal(
      deriveInstrumentState({ evidence_basis: { balance: 'one_sided_pos' } }).polarization_band,
      'one_sided',
    );
    assert.equal(
      deriveInstrumentState({ evidence_basis: { balance: 'mixed' } }).polarization_band,
      'mixed',
    );
    assert.equal(deriveInstrumentState({}).polarization_band, null);
  });

  it('deriveInstrumentState flags contested_thin for thin contested evidence', () => {
    const inst = deriveInstrumentState({
      evidence_basis: { sufficiency: 'thin', balance: 'contested' },
    });
    assert.equal(inst.contested_thin, true);
    assert.equal(inst.shows_assessment, false);
    assert.equal(inst.thin_evidence_instrument, 'limited_evidence_neutral');
  });

  it('deriveInstrumentState exposes counts and source mix on instrument', () => {
    const inst = deriveInstrumentState({
      confidence: 'high',
      signal_count: 6,
      distinct_article_count: 4,
      source_diversity: 3,
      sampling_status: 'normal',
      evidence_basis: {
        sufficiency: 'adequate',
        positive_count: 4,
        negative_count: 2,
        source_mix: { press: 3, social: 1 },
        concentration_warning: 'single_outlet',
      },
    });
    assert.equal(inst.confidence, 'high');
    assert.equal(inst.signal_count, 6);
    assert.equal(inst.distinct_article_count, 4);
    assert.equal(inst.source_diversity, 3);
    assert.equal(inst.positive_count, 4);
    assert.equal(inst.negative_count, 2);
    assert.deepEqual(inst.source_mix, { press: 3, social: 1 });
    assert.equal(inst.concentration_warning, 'single_outlet');
    assert.equal(inst.sampling_status, 'normal');
  });

  it('deriveInstrumentState surfaces critical presence failures', () => {
    const inst = deriveInstrumentState({
      presence_gate_triggered: true,
      evidence_basis: { sufficiency: 'adequate' },
    });
    assert.equal(inst.presence_gate_triggered, true);
    assert.equal(inst.shows_assessment, false);
    assert.equal(inst.operator_shows_score, false);
    assert.equal(inst.thin_evidence_instrument, 'critical_presence_failure');
  });

  it('operatorAssessmentSummary has no /10', () => {
    const line = operatorAssessmentSummary({
      report_scope: { label: 'National' },
      components: [
        { evidence_basis: { sufficiency: 'adequate' }, confidence: 'high' },
        { evidence_basis: { sufficiency: 'thin' }, confidence: 'low' },
      ],
    });
    assert.ok(!line.includes('/10'));
    assert.match(line, /adequate evidence: 1\/2/);
    assert.match(line, /thin: 1/);
  });

  it('redactAssessmentForView attaches instrument without deleting fields', () => {
    const assessment = {
      date: '2026-05-10',
      investigation_summary: { synthesis_mode: 'deterministic' },
      components: [{
        component_id: 'narrative',
        narrative: 'text',
        evidence: ['e1'],
        evidence_basis: { sufficiency: 'adequate' },
        confidence: 'high',
        data_quality_caveat: 'Source cap on ynet.',
        analyst_flags: ['tier_c_skipped'],
      }],
      component_diagnostics: { narrative: { claims_count: 0 } },
    };
    const out = redactAssessmentForView(assessment, DISPLAY_VIEWS.operator);
    assert.equal(out.display_view, DISPLAY_VIEWS.operator);
    const comp = out.components[0];
    assert.equal(comp.narrative, 'text');
    assert.deepEqual(comp.evidence, ['e1']);
    assert.equal(comp.instrument.evidence_sufficiency, 'adequate');
    // Passthrough: nothing is stripped any more.
    assert.equal(comp.data_quality_caveat, 'Source cap on ynet.');
    assert.deepEqual(comp.analyst_flags, ['tier_c_skipped']);
    assert.deepEqual(out.investigation_summary, { synthesis_mode: 'deterministic' });
    assert.deepEqual(out.component_diagnostics, { narrative: { claims_count: 0 } });
  });

  it('redactAssessmentForView ignores the view parameter (single view)', () => {
    const assessment = {
      components: [{
        component_id: 'narrative',
        narrative: 'Agent narrative.',
        narrative_operator: 'Operator narrative.',
      }],
    };
    const out = redactAssessmentForView(assessment, DISPLAY_VIEWS.analyst);
    assert.equal(out.display_view, DISPLAY_VIEWS.operator);
    assert.equal(out.components[0].narrative, 'Operator narrative.');
  });

  it('redactAssessmentForView prefers narrative_operator and operator synthesis', () => {
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
    // Source fields are preserved, not deleted.
    assert.equal(out.components[0].narrative_operator, 'Operator narrative.');
    assert.equal(out.cross_component_synthesis_operator, 'Operator synthesis.');
  });

  it('redactAssessmentForView falls back to agent narrative and synthesis', () => {
    const assessment = {
      cross_component_synthesis: 'Agent synthesis.',
      components: [{ component_id: 'narrative', narrative: 'Agent narrative.' }],
    };
    const out = redactAssessmentForView(assessment, DISPLAY_VIEWS.operator);
    assert.equal(out.components[0].narrative, 'Agent narrative.');
    assert.equal(out.cross_component_synthesis, 'Agent synthesis.');
  });

  it('redactAssessmentForView prefers evidence_operator over evidence', () => {
    const assessment = {
      components: [{
        component_id: 'narrative',
        evidence: ['Agent evidence.'],
        evidence_operator: ['Operator evidence.'],
      }],
    };
    const out = redactAssessmentForView(assessment, DISPLAY_VIEWS.operator);
    assert.deepEqual(out.components[0].evidence, ['Operator evidence.']);
    assert.deepEqual(out.components[0].evidence_operator, ['Operator evidence.']);
  });

  it('redactAssessmentForView prefers structured evidence_operator', () => {
    const structured = [{
      text: 'Operator claim.',
      source_type: 'press',
      article_source: 'ynet.co.il',
      markdown: '- Operator claim. [source](https://ynet.co.il/x)',
    }];
    const assessment = {
      components: [{
        component_id: 'narrative',
        evidence_operator: ['- bullet'],
        evidence_operator_structured: structured,
      }],
    };
    const out = redactAssessmentForView(assessment, DISPLAY_VIEWS.operator);
    assert.equal(out.components[0].evidence.length, 1);
    assert.equal(out.components[0].evidence[0].source_type, 'press');
    assert.deepEqual(out.components[0].evidence_operator_structured, structured);
  });

  it('redactAssessmentForView passes through non-object input', () => {
    assert.equal(redactAssessmentForView(null, DISPLAY_VIEWS.operator), null);
    assert.equal(redactAssessmentForView(undefined, DISPLAY_VIEWS.operator), undefined);
  });

  it('redactScoreBySource is a pure passthrough', () => {
    const raw = {
      news: {
        narrative: { signals: [{ signal_type: 'x' }], evidence_basis: { sufficiency: 'moderate' } },
      },
    };
    assert.equal(redactScoreBySource(raw, DISPLAY_VIEWS.operator), raw);
    assert.equal(redactScoreBySource(null), null);
    assert.equal(redactScoreBySource(undefined), null);
  });

  it('redactReportPayload wraps assessment and leaves the rest untouched', () => {
    const payload = {
      assessment: {
        components: [{ component_id: 'narrative', evidence_basis: { sufficiency: 'moderate' } }],
      },
      score_by_source: { news: { narrative: { signals: [] } } },
    };
    const out = redactReportPayload(payload, DISPLAY_VIEWS.operator);
    assert.equal(out.display_view, DISPLAY_VIEWS.operator);
    assert.equal(out.assessment.display_view, DISPLAY_VIEWS.operator);
    assert.equal(out.assessment.components[0].instrument.evidence_sufficiency, 'moderate');
    assert.deepEqual(out.score_by_source, payload.score_by_source);
  });

  it('redactReportPayload keeps markdown as-is (no brief swap)', () => {
    const out = redactReportPayload({
      assessment: { components: [] },
      markdown: '# Full report',
      markdown_brief: '# Brief only',
    }, DISPLAY_VIEWS.operator);
    assert.equal(out.markdown, '# Full report');
    assert.equal(out.markdown_brief, '# Brief only');
  });
});
