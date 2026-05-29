import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { scoreComponents } from '../../../../../../business_modules/resilience/domain/services/behaviorSignals.js';
import {
  buildWeightSensitivityBand,
  computeWeightSensitivity,
  shouldComputeWeightSensitivity,
} from '../../../../../../business_modules/resilience/domain/services/scoring/weightSensitivity.js';
import {
  defaultSignalWeights,
  perturbWeights,
} from '../../../../../../business_modules/resilience/domain/services/scoring/scoringOverrides.js';

describe('weightSensitivity', () => {
  it('perturbWeights is deterministic for a fixed seed', () => {
    const base = defaultSignalWeights();
    const a = perturbWeights(base, { pct: 0.12, seed: 42 });
    const b = perturbWeights(base, { pct: 0.12, seed: 42 });
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, base);
  });

  it('buildWeightSensitivityBand marks fragile when band_width >= 2', () => {
    const band = buildWeightSensitivityBand(7, 5, 8);
    assert.equal(band.band_width, 3);
    assert.equal(band.fragile, true);
  });

  it('shouldComputeWeightSensitivity respects tier3 record count', () => {
    assert.equal(shouldComputeWeightSensitivity({
      validationMaturity: { collection: { record_count: 29 } },
    }), false);
    assert.equal(shouldComputeWeightSensitivity({
      validationMaturity: { collection: { record_count: 30 } },
    }), true);
  });

  it('computeWeightSensitivity produces per-component bands', () => {
    const signals = [
      {
        signal_type: 'fear_expression',
        scope_level: 'quantified_or_broad',
        evidence_type: 'direct_quote_named_person',
        extraction_confidence: 1,
        source_type: 'news',
        article_source: 'a.example',
        article_url: 'https://a.example/1',
      },
      {
        signal_type: 'solidarity_help_others',
        scope_level: 'quantified_or_broad',
        evidence_type: 'direct_quote_named_person',
        extraction_confidence: 1,
        source_type: 'field',
        article_source: 'field',
        article_url: 'https://field/1',
      },
    ];
    const baseline = scoreComponents(signals, { totalArticles: 2 });
    const bands = computeWeightSensitivity(baseline, signals, { totalArticles: 2 }, { reliable: true });
    assert.ok(bands.belonging_solidarity?.baseline != null);
    assert.ok(bands.belonging_solidarity?.perturbed_low != null);
    assert.ok(bands.belonging_solidarity?.perturbed_high != null);
  });
});

describe('scoreComponents weightOverlay', () => {
  it('changes score when overlay adjusts mapped weight', () => {
    const signals = [{
      signal_type: 'fear_expression',
      scope_level: 'quantified_or_broad',
      evidence_type: 'direct_quote_named_person',
      extraction_confidence: 1,
      source_type: 'news',
      article_source: 'a.example',
      article_url: 'https://a.example/1',
    }];
    const baseline = scoreComponents(signals, { totalArticles: 1 });
    const boosted = scoreComponents(signals, {
      totalArticles: 1,
      weightOverlay: { fear_expression: { wellbeing_at_risk: -1.5 } },
    });
    assert.notEqual(
      baseline.wellbeing_at_risk.score,
      boosted.wellbeing_at_risk.score,
    );
  });
});
