import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  GROUNDING_TIER,
  isCriticalForGrounding,
  assignGroundingFields,
  groundingMetaFromEntailmentFail,
  UNVERIFIED_CRITICAL_GROUNDING_REASON,
} from '../../../../../business_modules/resilience_scorer/domain/services/signals/groundingPolicy.js';

describe('groundingPolicy', () => {
  it('detects critical signal types', () => {
    assert.equal(isCriticalForGrounding({ signal_type: 'harm_to_population' }), true);
    assert.equal(isCriticalForGrounding({ signal_type: 'fear_expression' }), false);
  });

  it('assignGroundingFields mutates signal', () => {
    const s = { signal_type: 'test' };
    assignGroundingFields(s, { tier: GROUNDING_TIER.weak, reason: 'x', method: 'y' });
    assert.equal(s.grounding_tier, GROUNDING_TIER.weak);
    assert.equal(s.grounding_reason, 'x');
  });

  it('entailment fail on critical yields Tier C', () => {
    const meta = groundingMetaFromEntailmentFail({ signal_type: 'panic_behavior' });
    assert.equal(meta.tier, GROUNDING_TIER.unverified_critical);
    assert.equal(meta.reason, 'entailment_failed_critical');
  });

  it('entailment fail on non-critical yields Tier B', () => {
    const meta = groundingMetaFromEntailmentFail({ signal_type: 'fear_expression' });
    assert.equal(meta.tier, GROUNDING_TIER.weak);
  });

  it('exports unverified critical reason constant', () => {
    assert.equal(UNVERIFIED_CRITICAL_GROUNDING_REASON, 'unverified_critical_grounding');
  });
});
