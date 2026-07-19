import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mergeDualExtractionSignals, isDualRequireAgreementEnabled } from '../../../../business_modules/resilience_scorer/infrastructure/dualModelExtract.js';

describe('mergeDualExtractionSignals', () => {
  it('dedupes identical keys and marks agreement', () => {
    const a = [{
      article_index: 1,
      signal_type: 'calm_confidence',
      evidence_type: 'observational_reported_fact',
      evidence: 'Residents described steady routines during the pause in alerts.',
      extraction_confidence: 0.8,
    }];
    const b = [{
      article_index: 1,
      signal_type: 'calm_confidence',
      evidence_type: 'observational_reported_fact',
      evidence: 'Residents described steady routines during the pause in alerts.',
      extraction_confidence: 0.75,
    }];
    const { signals: m } = mergeDualExtractionSignals(a, b);
    assert.equal(m.length, 1);
    assert.equal(m[0]._dual_pass_agreement, true);
    assert.ok(m[0].extraction_confidence > 0.8);
  });

  it('keeps disjoint signals from both passes when veto off', () => {
    const a = [{
      article_index: 1,
      signal_type: 'calm_confidence',
      evidence_type: 'observational_reported_fact',
      evidence: 'first unique evidence string for calm',
      extraction_confidence: 0.8,
    }];
    const b = [{
      article_index: 2,
      signal_type: 'fear_expression',
      evidence_type: 'observational_reported_fact',
      evidence: 'second unique evidence string for fear',
      extraction_confidence: 0.7,
    }];
    const { signals: m } = mergeDualExtractionSignals(a, b);
    assert.equal(m.length, 2);
  });

  it('veto mode drops signals without cross-pass agreement', () => {
    const a = [{
      article_index: 1,
      signal_type: 'calm_confidence',
      evidence_type: 'observational_reported_fact',
      evidence: 'only in pass one',
      extraction_confidence: 0.8,
    }];
    const b = [{
      article_index: 2,
      signal_type: 'fear_expression',
      evidence_type: 'observational_reported_fact',
      evidence: 'only in pass two',
      extraction_confidence: 0.7,
    }];
    const { signals, dual_veto_dropped } = mergeDualExtractionSignals(a, b, { requireAgreement: true });
    assert.equal(signals.length, 0);
    assert.equal(dual_veto_dropped, 1);
    const both = mergeDualExtractionSignals(
      [{ ...a[0], evidence: 'shared evidence text' }],
      [{ ...a[0], evidence: 'shared evidence text' }],
      { requireAgreement: true },
    );
    assert.equal(both.signals.length, 1);
    assert.equal(both.signals[0]._dual_pass_agreement, true);
  });

  it('isDualRequireAgreementEnabled defaults on', () => {
    delete process.env.RESILIENCE_DUAL_REQUIRE_AGREEMENT;
    assert.equal(isDualRequireAgreementEnabled(), true);
    process.env.RESILIENCE_DUAL_REQUIRE_AGREEMENT = '0';
    assert.equal(isDualRequireAgreementEnabled(), false);
    delete process.env.RESILIENCE_DUAL_REQUIRE_AGREEMENT;
  });
});
