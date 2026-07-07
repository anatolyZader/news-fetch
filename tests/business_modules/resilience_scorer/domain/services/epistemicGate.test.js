import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  applyEpistemicGate,
  applyScoreAbstention,
} from '../../../../../business_modules/resilience_scorer/domain/services/dataVoidIndex.js';
import { scoreComponents } from '../../../../../analyst/scoring/index.js';
import {
  deriveAssessmentEpistemicPolicy,
  deriveThinEvidencePolicy,
  THIN_EVIDENCE_INSTRUMENT,
} from '../../../../../business_modules/resilience_scorer/domain/services/thinEvidencePolicy.js';

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
      scoreComponents,
    });
    assert.equal(result.assessmentMode, 'field_anchor_only');
    assert.equal(result.epistemicStatus.scores_reliable, true);
    assert.ok(result.staleDigitalScores?.components?.narrative);
  });

  it('applyScoreAbstention preserves score_abstained and clears CI', () => {
    const out = applyScoreAbstention({
      narrative: {
        score: 8,
        confidence: 'high',
        score_low: 5,
        score_high: 9,
        ci_unstable: false,
      },
    });
    assert.equal(out.narrative.score, null);
    assert.equal(out.narrative.score_abstained, 8);
    assert.equal(out.narrative.score_low, null);
    assert.equal(out.narrative.score_high, null);
    assert.equal(out.narrative.ci_epistemic_invalid, true);
  });

  it('connectivity outage with field uses field_anchor via partition', () => {
    process.env.RESILIENCE_SCORING_PARTITION = '1';
    const fieldScored = mockScored(6);
    const quarantinedDigital = {
      count: 2,
      reason: 'connectivity_isolation',
      by_source_type: { telegram: 2 },
      sample_evidence: ['panic'],
    };
    const result = applyEpistemicGate({
      scoredFull: fieldScored,
      signalsForScoring: [{ source_type: 'pbo', evidence: 'field ok' }],
      dataVoid: {
        level: 'critical',
        connectivity_outage_signals: 1,
        field_volume: 1,
      },
      totalArticles: 1,
      digitalInclusiveScored: mockScored(3),
      scoringPartition: {
        assessmentMode: 'field_anchor_only',
        partitionApplied: true,
        quarantineReason: 'connectivity_isolation',
      },
      quarantinedDigital,
    });
    assert.equal(result.assessmentMode, 'field_anchor_only');
    assert.equal(result.scoredFull.narrative.score, 6);
    assert.equal(result.quarantinedDigital.count, 2);
    assert.equal(result.staleDigitalScores?.reason, 'connectivity_isolation');
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
