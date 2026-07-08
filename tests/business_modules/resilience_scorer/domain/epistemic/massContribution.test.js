import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  contributionForSignal,
  buildDuplicateOccurrenceIndex,
  duplicateArticleFactor,
} from '../../../../../business_modules/resilience_scorer/domain/epistemic/massContribution.js';
import { SIGNAL_PROVENANCE } from '../../../../../business_modules/resilience_scorer/domain/services/signals/evidenceEligibility.js';

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

describe('buildDuplicateOccurrenceIndex PBO visit keys', () => {
  it('keys PBO signals by article only so multiple types from one visit discount', () => {
    const signals = [
      { source_type: 'pbo', article_source: 'pbo-abelin', article_index: 1, signal_type: 'compliance_enter_shelter' },
      { source_type: 'pbo', article_source: 'pbo-abelin', article_index: 1, signal_type: 'leadership_visible_presence' },
      { source_type: 'pbo', article_source: 'pbo-abelin', article_index: 1, signal_type: 'community_volunteering' },
    ];
    const index = buildDuplicateOccurrenceIndex(signals);
    assert.equal(index.get(signals[0]), 1);
    assert.equal(index.get(signals[1]), 2);
    assert.equal(index.get(signals[2]), 3);
    assert.ok(duplicateArticleFactor(3) < duplicateArticleFactor(1));
  });

  it('keeps article|signal_type key for non-PBO sources', () => {
    const signals = [
      { source_type: 'news', article_index: 1, signal_type: 'fear_expression' },
      { source_type: 'news', article_index: 1, signal_type: 'harm_to_population' },
    ];
    const index = buildDuplicateOccurrenceIndex(signals);
    assert.equal(index.get(signals[0]), 1);
    assert.equal(index.get(signals[1]), 1);
  });
});
