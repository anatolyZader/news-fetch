import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildAssessmentPayload, suppressionTracePromptTag, formatScoredComponentsForNarrative } from '../../../../business_modules/resilience/infrastructure/claudeNarratives.js';
import {
  deriveInstrumentState,
  redactAssessmentForView,
} from '../../../../business_modules/resilience/domain/services/assessmentDisplayTier.js';
import { THIN_EVIDENCE_INSTRUMENT } from '../../../../business_modules/resilience/domain/services/thinEvidencePolicy.js';

function scoredWellbeing(overrides = {}) {
  return {
    score: 4,
    confidence: 'low',
    evidence_mass: 0.5,
    salience_critical: true,
    floor_bypassed: false,
    salience_bypass_reasons: ['critical_signal', 'high_trust_evidence', 'trusted_source'],
    salience_dominant_signal_type: 'harm_to_population',
    signal_count: 1,
    distinct_article_count: 1,
    source_diversity: 1,
    ...overrides,
  };
}

describe('buildAssessmentPayload — salience bypass fields', () => {
  it('persists salience_critical on assessment components', () => {
    const scoredComponents = {
      wellbeing_at_risk: scoredWellbeing(),
    };
    const assessment = buildAssessmentPayload(
      { components: [{ component_id: 'wellbeing_at_risk', narrative: '' }] },
      scoredComponents,
      { date: '2026-05-26', totalArticles: 1, contentKind: 'news' },
    );

    const comp = assessment.components.find((c) => c.component_id === 'wellbeing_at_risk');
    assert.ok(comp, 'wellbeing_at_risk component present');
    assert.equal(comp.salience_critical, true);
    assert.equal(comp.floor_bypassed, false);
    assert.deepEqual(comp.salience_bypass_reasons, [
      'critical_signal',
      'high_trust_evidence',
      'trusted_source',
    ]);
    assert.equal(comp.salience_dominant_signal_type, 'harm_to_population');
  });

  it('operator redaction exposes critical_single_signal instrument with score visible', () => {
    const scoredComponents = {
      wellbeing_at_risk: scoredWellbeing(),
    };
    const assessment = buildAssessmentPayload(
      { components: [{ component_id: 'wellbeing_at_risk', narrative: '' }] },
      scoredComponents,
      { date: '2026-05-26', totalArticles: 1, contentKind: 'news' },
    );

    const comp = assessment.components.find((c) => c.component_id === 'wellbeing_at_risk');
    const inst = deriveInstrumentState(comp);
    assert.equal(inst.thin_evidence_instrument, THIN_EVIDENCE_INSTRUMENT.critical_single_signal);
    assert.equal(inst.operator_shows_score, true);
    assert.equal(inst.salience_critical, true);

    const redacted = redactAssessmentForView(assessment, 'operator');
    const redactedComp = redacted.components.find((c) => c.component_id === 'wellbeing_at_risk');
    assert.equal(
      redactedComp.instrument.thin_evidence_instrument,
      THIN_EVIDENCE_INSTRUMENT.critical_single_signal,
    );
    assert.equal(redactedComp.instrument.operator_shows_score, true);
    assert.equal(redactedComp.score, undefined, 'numeric score stripped for operator view');
  });
});

describe('suppressionTracePromptTag', () => {
  it('returns empty when no suppression signals', () => {
    assert.equal(suppressionTracePromptTag({
      suppression_delta: 0.2,
      source_cap_binding: false,
      suppression_breakdown: { source_cap: -0.2, min_mass_floor: null },
    }), '');
  });

  it('emits when source_cap effect >= 0.5 without binding', () => {
    const tag = suppressionTracePromptTag({
      score_raw: 8,
      score_headline: 7,
      suppression_delta: 0.4,
      source_cap_binding: false,
      suppression_breakdown: { source_cap: -0.8, min_mass_floor: null },
    });
    assert.match(tag, /SUPPRESSION_TRACE/);
    assert.match(tag, /source_cap_effect=-0.8/);
  });

  it('includes breakdown when delta is large', () => {
    const tag = suppressionTracePromptTag({
      score_raw: 9,
      score_headline: 7,
      suppression_delta: 2,
      suppression_breakdown: { source_cap: -2, min_mass_floor: null },
      source_cap_binding: true,
    });
    assert.match(tag, /SUPPRESSION_TRACE/);
    assert.match(tag, /raw=9 headline=7/);
    assert.match(tag, /source_cap_effect=-2/);
    assert.match(tag, /SOURCE_CAP_BINDING/);
  });

  it('emits on source_cap_binding even when delta is below threshold', () => {
    const tag = suppressionTracePromptTag({
      score_raw: 6,
      score_headline: 6,
      suppression_delta: 0,
      source_cap_binding: true,
      suppression_breakdown: { source_cap: -0.8, min_mass_floor: null },
    });
    assert.match(tag, /SOURCE_CAP_BINDING/);
    assert.match(tag, /source_cap_effect=-0.8/);
  });

  it('includes thin_evidence_floor in narrative prompt block', () => {
    const prompt = formatScoredComponentsForNarrative({
      narrative: {
        score: 5,
        score_raw: 9,
        score_headline: 5,
        suppression_delta: 4,
        certainty: 0.2,
        strength: 0.1,
        distinct_article_count: 1,
        coverage_ratio: 0.1,
        dispersion: 'low',
        positive_evidence: 1,
        negative_evidence: 0,
        signal_count: 1,
        signals: [],
        confidence: 'low',
        suppression_breakdown: { source_cap: null, min_mass_floor: -4 },
      },
    }, 10, { includeScores: true });
    assert.match(prompt, /thin_evidence_floor=-4/);
  });

  it('includes data quality context and SUPPRESSION_TRACE in instrument mode', () => {
    const prompt = formatScoredComponentsForNarrative({
      narrative: {
        score: 7,
        score_raw: 9,
        score_headline: 7,
        suppression_delta: 2,
        certainty: 0.5,
        strength: 0.8,
        distinct_article_count: 5,
        signal_count: 9,
        positive_evidence: 8,
        negative_evidence: 1,
        source_cap_binding: true,
        derived_indicators: {
          dominant_outlet_key: 'ynet.co.il',
          outlet_concentration_warning: true,
        },
        signals: [{
          signal_type: 'resilience_narrative_positive',
          article_source: 'ynet.co.il',
          _contribution: 0.7,
          _contribution_raw: 2.1,
          _cap_layer: 'article_source',
        }],
        suppression_breakdown: { source_cap: -2, min_mass_floor: null },
      },
    }, 10, { includeScores: false });
    assert.match(prompt, /SUPPRESSION_TRACE/);
    assert.match(prompt, /dominant_outlet=ynet\.co\.il/);
    assert.match(prompt, /Top contributors/);
  });

  it('persists data_quality_caveat on assessment payload', () => {
    const assessment = buildAssessmentPayload(
      {
        components: [{
          component_id: 'narrative',
          narrative: 'Reporting describes coping.',
          data_quality_caveat: 'Headline limited by ynet.co.il source cap.',
        }],
      },
      { narrative: { score: 7, signal_count: 1 } },
      { date: '2026-05-26', totalArticles: 1, contentKind: 'news' },
    );
    const comp = assessment.components.find((c) => c.component_id === 'narrative');
    assert.equal(comp.data_quality_caveat, 'Headline limited by ynet.co.il source cap.');
  });
});
