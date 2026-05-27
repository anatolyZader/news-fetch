import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  applyEpistemicGate,
  applyScoreAbstention,
} from '../../../../../business_modules/resilience/domain/services/dataVoidIndex.js';
import {
  deriveAssessmentEpistemicPolicy,
  deriveThinEvidencePolicy,
  THIN_EVIDENCE_INSTRUMENT,
} from '../../../../../business_modules/resilience/domain/services/thinEvidencePolicy.js';

function mockScored(score = 6) {
  return {
    narrative: {
      score,
      confidence: 'high',
      evidence_mass: 4,
      signal_count: 3,
    },
    wellbeing_at_risk: {
      score,
      confidence: 'medium',
      evidence_mass: 2,
      signal_count: 2,
    },
  };
}

describe('epistemicGate', () => {
  it('abstention suppresses headline scores when level elevated', () => {
    const scored = mockScored(7);
    const result = applyEpistemicGate({
      scoredFull: scored,
      signalsForScoring: [{ source_type: 'news', evidence: 'x', article_source: 'a' }],
      dataVoid: { level: 'elevated', reason: 'sparse_sampling' },
      totalArticles: 1,
    });
    assert.equal(result.assessmentMode, 'abstained');
    assert.equal(result.scoredFull.narrative.score, null);
    assert.equal(result.scoredFull.narrative.confidence, 'insufficient_data');
    assert.equal(result.scoredFull.narrative.score_abstained, 7);
    assert.equal(result.epistemicStatus.scores_reliable, false);
    assert.equal(result.epistemicStatus.sampling_status, 'blind');
  });

  it('digital_darkness publishes field-only scores', () => {
    const scored = mockScored(5);
    const signals = [
      { source_type: 'news', signal_type: 'calm_confidence', evidence: 'news', article_source: 'n1' },
      { source_type: 'pbo', signal_type: 'service_continuity', evidence: 'field', article_source: 'p1' },
    ];
    const result = applyEpistemicGate({
      scoredFull: scored,
      signalsForScoring: signals,
      dataVoid: { level: 'critical', digital_darkness: true, reason: 'digital_darkness' },
      totalArticles: 2,
      digitalInclusiveScored: scored,
    });
    assert.equal(result.assessmentMode, 'field_anchor_only');
    assert.equal(result.epistemicStatus.scores_reliable, true);
    assert.ok(result.staleDigitalScores?.components?.narrative);
  });

  it('applyScoreAbstention preserves score_abstained', () => {
    const out = applyScoreAbstention({ narrative: { score: 8, confidence: 'high' } });
    assert.equal(out.narrative.score, null);
    assert.equal(out.narrative.score_abstained, 8);
  });
});

describe('thinEvidencePolicy sampling_blind', () => {
  it('forces sampling_blind when assessment epistemic gate active', () => {
    const policy = deriveAssessmentEpistemicPolicy(
      { level: 'elevated' },
      { sampling_status: 'blind', assessment_mode: 'abstained' },
    );
    assert.equal(policy.globalOperatorShowsScore, false);
    const comp = deriveThinEvidencePolicy(
      { score: 7, evidence_mass: 5, confidence: 'high' },
      { assessmentEpistemic: policy },
    );
    assert.equal(comp.instrument, THIN_EVIDENCE_INSTRUMENT.sampling_blind);
    assert.equal(comp.operatorShowsScore, false);
  });
});
