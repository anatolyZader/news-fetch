import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildAssessmentPayload } from '../../../../business_modules/resilience/infrastructure/claudeNarratives.js';
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
