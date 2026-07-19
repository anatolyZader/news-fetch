import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  CRITICAL_BYPASS_SIGNAL_TYPES,
  evaluateHighSalienceBypass,
  findDominantContributor,
  isHighSalienceBypassEnabled,
} from '../../../../../business_modules/resilience_scorer/domain/epistemic/highSalienceBypass.js';
import {
  deriveThinEvidencePolicy,
  THIN_EVIDENCE_INSTRUMENT,
} from '../../../../../business_modules/resilience_scorer/domain/epistemic/thinEvidencePolicy.js';
import { UNVERIFIED_CRITICAL_GROUNDING_REASON } from '../../../../../business_modules/resilience_scorer/domain/services/signals/groundingPolicy.js';

describe('highSalienceBypass', () => {
  it('is enabled by default', () => {
    const prev = process.env.RESILIENCE_HIGH_SALIENCE_BYPASS;
    delete process.env.RESILIENCE_HIGH_SALIENCE_BYPASS;
    assert.equal(isHighSalienceBypassEnabled(), true);
    process.env.RESILIENCE_HIGH_SALIENCE_BYPASS = '0';
    assert.equal(isHighSalienceBypassEnabled(), false);
    if (prev == null) delete process.env.RESILIENCE_HIGH_SALIENCE_BYPASS;
    else process.env.RESILIENCE_HIGH_SALIENCE_BYPASS = prev;
  });

  it('findDominantContributor picks the largest |contribution|', () => {
    const items = [
      { contribution: 0.1, signal: { signal_type: 'a' } },
      { contribution: 0.9, signal: { signal_type: 'b' } },
    ];
    const { item, share } = findDominantContributor(items);
    assert.equal(item.signal.signal_type, 'b');
    assert.ok(share >= 0.85);
  });

  it('operatorCritical for verified field harm signal with thin mass', () => {
    const items = [{
      contribution: 0.5,
      signal: {
        signal_type: 'harm_to_population',
        evidence_type: 'direct_quote_named_person',
        scope_level: 'single_case',
        intensity: 'severe',
        source_type: 'field',
      },
    }];
    const r = evaluateHighSalienceBypass(items, 0.5, 5);
    assert.equal(r.operatorCritical, true);
    assert.ok(r.reasons.includes('critical_signal'));
    assert.ok(r.reasons.includes('high_trust_evidence'));
    assert.ok(r.reasons.includes('trusted_source'));
    assert.equal(r.skipFloor, false);
  });

  it('skipFloor when raw score would clamp below 3', () => {
    const items = [{
      contribution: 1,
      signal: {
        signal_type: 'harm_to_population',
        evidence_type: 'named_institutional_fact',
        scope_level: 'quantified_or_broad',
        intensity: 'severe',
        source_type: 'field',
      },
    }];
    const r = evaluateHighSalienceBypass(items, 1, 2);
    assert.equal(r.operatorCritical, true);
    assert.equal(r.skipFloor, true);
  });

  it('does not bypass for low-stakes thin compliance signal', () => {
    const items = [{
      contribution: 0.2,
      signal: {
        signal_type: 'non_compliance_exit_early',
        evidence_type: 'observational_reported_fact',
        scope_level: 'single_case',
        source_type: 'news',
      },
    }];
    const r = evaluateHighSalienceBypass(items, 0.2, 2);
    assert.equal(r.operatorCritical, false);
    assert.equal(r.skipFloor, false);
  });

  it('includes curated critical signal types', () => {
    assert.ok(CRITICAL_BYPASS_SIGNAL_TYPES.has('harm_to_population'));
    assert.ok(CRITICAL_BYPASS_SIGNAL_TYPES.has('early_warning_system_failure'));
  });

  it('operatorCritical for Tier C unverified critical grounding', () => {
    const items = [{
      contribution: 0,
      signal: {
        signal_type: 'panic_behavior',
        grounding_tier: 'unverified_critical',
        evidence_type: 'observational_reported_fact',
        source_type: 'whatsapp',
      },
    }];
    const r = evaluateHighSalienceBypass(items, 0, 5);
    assert.equal(r.operatorCritical, true);
    assert.ok(r.reasons.includes(UNVERIFIED_CRITICAL_GROUNDING_REASON));
    assert.equal(r.skipFloor, false);
  });
});

describe('thinEvidencePolicy — critical single signal', () => {
  it('shows score for salience_critical components', () => {
    const r = deriveThinEvidencePolicy({
      confidence: 'low',
      signal_count: 1,
      salience_critical: true,
    });
    assert.equal(r.instrument, THIN_EVIDENCE_INSTRUMENT.critical_single_signal);
    assert.equal(r.operatorShowsScore, true);
  });

  it('hides score for unverified critical grounding', () => {
    const r = deriveThinEvidencePolicy({
      confidence: 'low',
      signal_count: 1,
      salience_critical: true,
      salience_bypass_reasons: ['critical_signal', UNVERIFIED_CRITICAL_GROUNDING_REASON],
    });
    assert.equal(r.instrument, THIN_EVIDENCE_INSTRUMENT.unverified_alert);
    assert.equal(r.operatorShowsScore, false);
  });
});
