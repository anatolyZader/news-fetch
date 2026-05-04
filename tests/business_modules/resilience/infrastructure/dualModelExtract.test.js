import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mergeDualExtractionSignals } from '../../../../business_modules/resilience/infrastructure/dualModelExtract.js';
import { scoreComponents } from '../../../../business_modules/resilience/domain/services/behaviorSignals.js';

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
    const m = mergeDualExtractionSignals(a, b);
    assert.equal(m.length, 1);
    assert.equal(m[0]._dual_pass_agreement, true);
    assert.ok(m[0].extraction_confidence > 0.8);
  });

  it('keeps disjoint signals from both passes', () => {
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
    const m = mergeDualExtractionSignals(a, b);
    assert.equal(m.length, 2);
  });
});

describe('dual-pass agreement reliability bump', () => {
  function obs(idx) {
    return {
      article_index: idx,
      article_url: `https://ynet.co.il/o${idx}`,
      article_source: 'ynet.co.il',
      source_type: 'news',
      signal_type: 'compliance_enter_shelter',
      evidence_type: 'observational_reported_fact',
      scope_level: 'single_case',
      evidence: `obs evidence ${idx}`,
      extraction_confidence: 0.85,
      temporal_weight: 1.0,
    };
  }

  it('agreed signals produce a higher evidence_mass than non-agreed (default boost)', () => {
    const single = [obs(1), obs(2), obs(3)];
    const agreed = single.map((s) => ({ ...s, _dual_pass_agreement: true }));

    const a = scoreComponents(single, { totalArticles: 3 });
    const b = scoreComponents(agreed, { totalArticles: 3 });
    assert.ok(
      b.lifesaving_behavior.evidence_mass > a.lifesaving_behavior.evidence_mass,
      `expected boosted mass > baseline (${b.lifesaving_behavior.evidence_mass} > ${a.lifesaving_behavior.evidence_mass})`,
    );
  });

  it('respects RESILIENCE_DUAL_AGREEMENT_BOOST and clamps to [1, 1.2]', () => {
    const agreed = [obs(1), obs(2)].map((s) => ({ ...s, _dual_pass_agreement: true }));
    const prev = process.env.RESILIENCE_DUAL_AGREEMENT_BOOST;
    process.env.RESILIENCE_DUAL_AGREEMENT_BOOST = '0.5';
    let clampedDown;
    let clampedUp;
    try {
      clampedDown = scoreComponents(agreed, { totalArticles: 2 });
      process.env.RESILIENCE_DUAL_AGREEMENT_BOOST = '99';
      clampedUp = scoreComponents(agreed, { totalArticles: 2 });
    } finally {
      if (prev === undefined) delete process.env.RESILIENCE_DUAL_AGREEMENT_BOOST;
      else process.env.RESILIENCE_DUAL_AGREEMENT_BOOST = prev;
    }
    const baseline = scoreComponents([obs(1), obs(2)], { totalArticles: 2 });
    assert.equal(
      clampedDown.lifesaving_behavior.evidence_mass,
      baseline.lifesaving_behavior.evidence_mass,
      'boost < 1 should clamp to 1 (no change vs baseline)',
    );
    assert.ok(
      clampedUp.lifesaving_behavior.evidence_mass <= baseline.lifesaving_behavior.evidence_mass * 1.2 + 1e-9,
      'boost > 1.2 should clamp to 1.2',
    );
    assert.ok(
      clampedUp.lifesaving_behavior.evidence_mass > baseline.lifesaving_behavior.evidence_mass,
    );
  });
});
