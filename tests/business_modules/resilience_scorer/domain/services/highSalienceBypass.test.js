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
import { scoreComponents } from '../../../../../business_modules/resilience_scorer/analyst/scoring/index.js';
import { contributionForSignal } from '../../../../../business_modules/resilience_scorer/domain/epistemic/massContribution.js';
import { GROUNDING_TIER } from '../../../../../business_modules/resilience_scorer/domain/services/signals/groundingPolicy.js';

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
    assert.ok(r.reasons.includes('unverified_critical_grounding'));
    assert.equal(r.skipFloor, false);
  });
});

describe('thinEvidencePolicy — critical single signal', () => {
  it('shows score for salience_critical components', () => {
    const r = deriveThinEvidencePolicy({
      score: 4,
      confidence: 'low',
      evidence_mass: 0.5,
      salience_critical: true,
    });
    assert.equal(r.instrument, THIN_EVIDENCE_INSTRUMENT.critical_single_signal);
    assert.equal(r.operatorShowsScore, true);
  });

  it('hides score for unverified critical grounding', () => {
    const r = deriveThinEvidencePolicy({
      score: 4,
      confidence: 'low',
      evidence_mass: 0,
      salience_critical: true,
      salience_bypass_reasons: ['critical_signal', 'unverified_critical_grounding'],
    });
    assert.equal(r.instrument, THIN_EVIDENCE_INSTRUMENT.unverified_alert);
    assert.equal(r.operatorShowsScore, false);
  });
});

describe('scoreComponents — high-salience bypass integration', () => {
  it('marks wellbeing critical on verified field harm report', () => {
    const scored = scoreComponents([
      {
        article_index: 1,
        article_url: 'https://field.example/report-1',
        article_source: 'pbo-north',
        source_type: 'field',
        signal_type: 'harm_to_population',
        evidence_type: 'direct_quote_named_person',
        scope_level: 'single_case',
        intensity: 'severe',
        evidence: 'MDA paramedic: three civilians killed, many wounded in direct hit.',
        extraction_confidence: 0.95,
        temporal_weight: 1,
      },
    ], { totalArticles: 1 });

    assert.ok(scored.wellbeing_at_risk.evidence_mass < 1.5);
    assert.equal(scored.wellbeing_at_risk.salience_critical, true);
    assert.ok(Array.isArray(scored.wellbeing_at_risk.salience_bypass_reasons));
    assert.equal(
      deriveThinEvidencePolicy(scored.wellbeing_at_risk).instrument,
      THIN_EVIDENCE_INSTRUMENT.critical_single_signal,
    );
  });

  it('does not mark thin low-stakes compliance signal as salience_critical', () => {
    const scored = scoreComponents([
      {
        article_index: 1,
        article_url: 'https://x.com/thin',
        article_source: 'x.com',
        source_type: 'news',
        signal_type: 'non_compliance_exit_early',
        evidence_type: 'observational_reported_fact',
        scope_level: 'single_case',
        evidence: 'Two residents reportedly left shelter before all-clear.',
        extraction_confidence: 0.6,
        temporal_weight: 1,
      },
    ], { totalArticles: 1 });

    assert.equal(scored.lifesaving_behavior.salience_critical, false);
    assert.ok(scored.lifesaving_behavior.score >= 3 && scored.lifesaving_behavior.score <= 8);
  });

  it('Tier C unverified critical contributes zero mass', () => {
    const base = contributionForSignal(
      {
        signal_type: 'harm_to_population',
        evidence_type: 'direct_quote_named_person',
        scope_level: 'single_case',
        extraction_confidence: 1,
        grounding_tier: GROUNDING_TIER.grounded,
      },
      1,
    );
    const tierC = contributionForSignal(
      {
        signal_type: 'harm_to_population',
        evidence_type: 'direct_quote_named_person',
        scope_level: 'single_case',
        extraction_confidence: 1,
        grounding_tier: GROUNDING_TIER.unverified_critical,
      },
      1,
    );
    assert.ok(base > 0);
    assert.equal(tierC, 0);
  });
});
