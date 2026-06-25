import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { contributionForSignal } from '../../../../../business_modules/resilience/domain/epistemic/massContribution.js';
import { SIGNAL_PROVENANCE } from '../../../../../business_modules/resilience/domain/services/evidenceEligibility.js';

describe('massContribution', () => {
  it('applies partial_void_press weight discount', () => {
    const base = {
      source_type: 'news',
      signal_type: 'fear_expression',
      evidence_type: 'observational_reported_fact',
      partial_void_press: true,
    };
    const full = contributionForSignal({ ...base, partial_void_press: false }, 1);
    const partial = contributionForSignal(base, 1);
    assert.ok(partial < full);
    assert.ok(Math.abs(partial / full - 0.5) < 0.01);
  });

  it('uses repeated_pattern scope for geo-verified press', () => {
    const verified = {
      source_type: 'news',
      signal_type: 'fear_expression',
      evidence_type: 'observational_reported_fact',
      signalProvenance: SIGNAL_PROVENANCE.verified_geo,
      geo: {
        kind: 'resolved',
        policy: { usableForMetrics: true },
        resolution: { provenance: 'structured' },
      },
    };
    const plain = {
      source_type: 'news',
      signal_type: 'fear_expression',
      evidence_type: 'observational_reported_fact',
    };
    const verifiedMass = contributionForSignal(verified, 1);
    const plainMass = contributionForSignal(plain, 1);
    assert.ok(verifiedMass > plainMass);
  });
});
