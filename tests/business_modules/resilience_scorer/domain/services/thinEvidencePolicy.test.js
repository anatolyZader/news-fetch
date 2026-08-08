import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  deriveThinEvidencePolicy,
  THIN_EVIDENCE_INSTRUMENT,
} from '../../../../../business_modules/resilience_scorer/domain/epistemic/thinEvidencePolicy.js';
import { UNVERIFIED_CRITICAL_GROUNDING_REASON } from '../../../../../business_modules/resilience_scorer/domain/services/signals/groundingPolicy.js';

describe('thinEvidencePolicy', () => {
  it('returns insufficient_data when sufficiency is none', () => {
    const r = deriveThinEvidencePolicy({
      evidence_basis: { sufficiency: 'none', balance: null },
    });
    assert.equal(r.instrument, THIN_EVIDENCE_INSTRUMENT.insufficient_data);
    assert.equal(r.userShowsScore, false);
  });

  it('returns insufficient_data on epistemic abstention', () => {
    const r = deriveThinEvidencePolicy({
      epistemic_abstention: true,
      evidence_basis: { sufficiency: 'moderate', balance: 'mixed' },
    });
    assert.equal(r.instrument, THIN_EVIDENCE_INSTRUMENT.insufficient_data);
    assert.equal(r.userShowsScore, false);
  });

  it('returns critical_presence_failure when presence gate triggered', () => {
    const r = deriveThinEvidencePolicy({
      presence_gate_triggered: true,
      evidence_basis: { sufficiency: 'moderate', balance: 'mixed' },
    });
    assert.equal(r.instrument, THIN_EVIDENCE_INSTRUMENT.critical_presence_failure);
    assert.equal(r.userShowsScore, false);
  });

  it('returns critical_presence_failure for user_status critical_failure', () => {
    const r = deriveThinEvidencePolicy({
      user_status: 'critical_failure',
      evidence_basis: { sufficiency: 'thin', balance: null },
    });
    assert.equal(r.instrument, THIN_EVIDENCE_INSTRUMENT.critical_presence_failure);
    assert.equal(r.userShowsScore, false);
  });

  it('returns critical_single_signal for salience_critical components', () => {
    const r = deriveThinEvidencePolicy({
      salience_critical: true,
      evidence_basis: { sufficiency: 'thin', balance: 'one_sided_neg' },
    });
    assert.equal(r.instrument, THIN_EVIDENCE_INSTRUMENT.critical_single_signal);
    assert.equal(r.userShowsScore, true);
  });

  it('returns unverified_alert only via unverified-critical bypass reason', () => {
    const r = deriveThinEvidencePolicy({
      salience_critical: true,
      salience_bypass_reasons: ['critical_signal', UNVERIFIED_CRITICAL_GROUNDING_REASON],
      evidence_basis: { sufficiency: 'thin', balance: 'one_sided_neg' },
    });
    assert.equal(r.instrument, THIN_EVIDENCE_INSTRUMENT.unverified_alert);
    assert.equal(r.userShowsScore, false);
  });

  it('returns limited_evidence_neutral for thin non-critical evidence', () => {
    const r = deriveThinEvidencePolicy({
      evidence_basis: { sufficiency: 'thin', balance: 'one_sided_pos' },
    });
    assert.equal(r.instrument, THIN_EVIDENCE_INSTRUMENT.limited_evidence_neutral);
    assert.equal(r.userShowsScore, false);
    assert.equal(r.contested_thin, false);
  });

  it('flags contested_thin when thin evidence is contested', () => {
    const r = deriveThinEvidencePolicy({
      evidence_basis: { sufficiency: 'thin', balance: 'contested' },
    });
    assert.equal(r.instrument, THIN_EVIDENCE_INSTRUMENT.limited_evidence_neutral);
    assert.equal(r.contested_thin, true);
  });

  it('contested moderate evidence stays limited_evidence_neutral with contested_thin', () => {
    const r = deriveThinEvidencePolicy({
      evidence_basis: { sufficiency: 'moderate', balance: 'contested' },
    });
    assert.equal(r.instrument, THIN_EVIDENCE_INSTRUMENT.limited_evidence_neutral);
    assert.equal(r.userShowsScore, false);
    assert.equal(r.contested_thin, true);
  });

  it('returns adequate for uncontested moderate evidence', () => {
    const r = deriveThinEvidencePolicy({
      evidence_basis: { sufficiency: 'moderate', balance: 'mixed' },
    });
    assert.equal(r.instrument, THIN_EVIDENCE_INSTRUMENT.adequate);
    assert.equal(r.userShowsScore, true);
    assert.equal(r.contested_thin, false);
  });

  it('legacy components fall back to count-based sufficiency', () => {
    const none = deriveThinEvidencePolicy({ confidence: 'insufficient_data', signal_count: 0 });
    assert.equal(none.instrument, THIN_EVIDENCE_INSTRUMENT.insufficient_data);

    const thin = deriveThinEvidencePolicy({ confidence: 'low', signal_count: 2 });
    assert.equal(thin.instrument, THIN_EVIDENCE_INSTRUMENT.limited_evidence_neutral);

    const ok = deriveThinEvidencePolicy({ confidence: 'medium', signal_count: 4 });
    assert.equal(ok.instrument, THIN_EVIDENCE_INSTRUMENT.adequate);
  });
});
