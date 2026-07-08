import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldQueueEntailmentCheck,
  isShortEvidence,
  isShortBody,
  resolveFailedGrounding,
  selectEntailmentPremise,
} from '../../../../business_modules/resilience_scorer/infrastructure/claudeEvidenceVerification.js';
import { GROUNDING_TIER } from '../../../../business_modules/resilience_scorer/domain/services/signals/groundingPolicy.js';

describe('claudeEvidenceVerification — short evidence routing', () => {
  const primaryFail = { ok: false, reason: 'low_similarity', sim: 0 };

  it('detects short evidence', () => {
    assert.equal(isShortEvidence({ evidence: 'we burning help' }), true);
    assert.equal(isShortEvidence({ evidence: 'one two three four five six seven eight nine' }), false);
  });

  it('detects short body', () => {
    assert.equal(isShortBody('שקט בקריית שמונה'), true);
    assert.equal(isShortBody('x'.repeat(100)), false);
  });

  it('queues entailment for short evidence even when sim is zero', () => {
    const prev = process.env.RESILIENCE_NLI_VERIFY;
    delete process.env.RESILIENCE_NLI_VERIFY;
    const signal = { evidence: 'אנחנו בוערים', evidence_type: 'observational_reported_fact' };
    assert.equal(
      shouldQueueEntailmentCheck(signal, primaryFail, 'עזרה! אנחנו בוערים'),
      true,
    );
    if (prev == null) delete process.env.RESILIENCE_NLI_VERIFY;
    else process.env.RESILIENCE_NLI_VERIFY = prev;
  });

  it('uses full body as premise for short sources', () => {
    const body = 'עזרה! אנחנו בוערים';
    assert.equal(selectEntailmentPremise('אנחנו בוערים', body), body);
  });

  it('keeps critical signals as Tier C on failure', () => {
    const prev = process.env.RESILIENCE_GROUNDING_TIERED_VERIFY;
    delete process.env.RESILIENCE_GROUNDING_TIERED_VERIFY;
    const r = resolveFailedGrounding(
      { signal_type: 'panic_behavior', evidence: 'help us' },
      primaryFail,
    );
    assert.equal(r.action, 'keep');
    assert.equal(r.meta.tier, GROUNDING_TIER.unverified_critical);
    if (prev == null) delete process.env.RESILIENCE_GROUNDING_TIERED_VERIFY;
    else process.env.RESILIENCE_GROUNDING_TIERED_VERIFY = prev;
  });

  it('keeps non-critical as Tier B on failure when tiered verify enabled', () => {
    const prev = process.env.RESILIENCE_GROUNDING_TIERED_VERIFY;
    delete process.env.RESILIENCE_GROUNDING_TIERED_VERIFY;
    const r = resolveFailedGrounding(
      { signal_type: 'fear_expression', evidence: 'help us' },
      primaryFail,
    );
    assert.equal(r.action, 'keep');
    assert.equal(r.meta.tier, GROUNDING_TIER.weak);
    if (prev == null) delete process.env.RESILIENCE_GROUNDING_TIERED_VERIFY;
    else process.env.RESILIENCE_GROUNDING_TIERED_VERIFY = prev;
  });
});
