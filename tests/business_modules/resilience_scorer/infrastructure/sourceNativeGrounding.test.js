import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { applySourceNativeGrounding } from '../../../../business_modules/resilience_scorer/infrastructure/sourceNativeGrounding.js';
import { GROUNDING_TIER } from '../../../../business_modules/resilience_scorer/domain/services/signals/groundingPolicy.js';

describe('applySourceNativeGrounding', () => {
  it('anchors evidence to raw WhatsApp message', () => {
    const raw = 'שקט בקריית שמונה';
    const signals = [{
      signal_type: 'calm_confidence',
      evidence_type: 'observational_reported_fact',
      evidence: 'שקט בקריית שמונה',
    }];
    applySourceNativeGrounding(signals, raw, { source_type: 'whatsapp' });
    assert.equal(signals[0].grounding_tier, GROUNDING_TIER.grounded);
    assert.equal(signals[0].source_text, raw);
  });

  it('assigns Tier C when critical signal evidence does not match source', () => {
    const raw = 'עזרה!';
    const signals = [{
      signal_type: 'harm_to_population',
      evidence_type: 'observational_reported_fact',
      evidence: 'Twenty civilians killed in building strike',
    }];
    applySourceNativeGrounding(signals, raw, { source_type: 'whatsapp' });
    assert.equal(signals[0].grounding_tier, GROUNDING_TIER.unverified_critical);
  });

  it('assigns Tier B for non-critical mismatch', () => {
    const raw = 'עזרה!';
    const signals = [{
      signal_type: 'fear_expression',
      evidence_type: 'observational_reported_fact',
      evidence: 'Residents express deep fear about sirens',
    }];
    applySourceNativeGrounding(signals, raw, { source_type: 'whatsapp' });
    assert.equal(signals[0].grounding_tier, GROUNDING_TIER.weak);
  });
});
