import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  deriveThinEvidencePolicy,
  THIN_EVIDENCE_INSTRUMENT,
} from '../../../../../business_modules/resilience/domain/services/thinEvidencePolicy.js';

describe('thinEvidencePolicy', () => {
  it('returns unverified_alert when thin and floor_clamped', () => {
    const r = deriveThinEvidencePolicy({
      score: 3,
      confidence: 'low',
      evidence_mass: 1.0,
      floor_clamped: true,
    });
    assert.equal(r.instrument, THIN_EVIDENCE_INSTRUMENT.unverified_alert);
    assert.equal(r.operatorShowsScore, false);
  });

  it('returns limited_evidence_neutral when thin but not clamped', () => {
    const r = deriveThinEvidencePolicy({
      score: 5,
      confidence: 'low',
      evidence_mass: 1.2,
      floor_clamped: false,
    });
    assert.equal(r.instrument, THIN_EVIDENCE_INSTRUMENT.limited_evidence_neutral);
  });
});
