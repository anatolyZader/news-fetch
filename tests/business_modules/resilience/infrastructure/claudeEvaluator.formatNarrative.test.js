import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { formatScoredComponentsForNarrative }
  from '../../../../business_modules/resilience/infrastructure/claudeEvaluator.js';

function comp(overrides = {}) {
  return {
    score: 6,
    confidence: 'medium',
    positive_evidence: 1.2,
    negative_evidence: 0.4,
    net_evidence: 0.8,
    evidence_mass: 1.6,
    strength: 0.4,
    coverage_ratio: 0.25,
    coverage_adjustment: 0.85,
    source_diversity_factor: 0.95,
    type_diversity_factor: 0.92,
    signal_type_entropy: 0.4,
    adjusted_strength: 0.31,
    certainty: 0.5,
    polarization: 0.2,
    distinct_article_count: 2,
    source_diversity: 2,
    dispersion: 'low',
    score_low: 5, score_high: 7,
    signals: [],
    facets: {},
    ...overrides,
  };
}

describe('formatScoredComponentsForNarrative — A2', () => {
  it('renders extraction_confidence (not s.confidence) and evidence_type for each signal', () => {
    const scored = {
      narrative: comp({
        signals: [
          {
            signal_type: 'resilience_narrative_positive',
            scope_level: 'repeated_pattern',
            evidence_type: 'observational_reported_fact',
            extraction_confidence: 0.92,
            evidence: 'residents reported steady morale',
          },
        ],
      }),
    };
    const text = formatScoredComponentsForNarrative(scored, 4);
    assert.ok(!text.includes('confidence:undefined'),
      'must not render the legacy confidence:undefined text from the s.confidence bug');
    assert.ok(text.includes('conf:0.92'),
      'must render the new conf:<2dp> field from extraction_confidence');
    assert.ok(text.includes('ev:observational_reported_fact'),
      'must include evidence_type so Sonnet sees the reliability tier');
  });

  it('falls back to conf:1.00 when extraction_confidence is absent', () => {
    const scored = {
      narrative: comp({
        signals: [
          {
            signal_type: 'leadership_visible_presence',
            scope_level: 'single_case',
            evidence_type: 'direct_quote_named_person',
            evidence: 'mayor visited shelter',
          },
        ],
      }),
    };
    const text = formatScoredComponentsForNarrative(scored, 1);
    assert.ok(text.includes('conf:1.00'));
  });

  it('includes geo audit tags when text-inferred geo is metrics-ineligible', () => {
    const scored = {
      narrative: comp({
        signals: [
          {
            signal_type: 'panic_behavior',
            scope_level: 'single_case',
            evidence_type: 'observational_reported_fact',
            extraction_confidence: 0.9,
            evidence: 'Residents in Kiryat Shmona reported panic.',
            metricsEligible: false,
            geo: {
              kind: 'resolved',
              resolution: { provenance: 'text_inferred' },
              policy: { usableForMetrics: false, scopeConfidence: 'low' },
            },
          },
        ],
      }),
    };
    const text = formatScoredComponentsForNarrative(scored, 1);
    assert.ok(text.includes('geo:provenance=text_inferred'));
    assert.ok(text.includes('metricsEligible=false'));
    assert.ok(text.includes('scopeConfidence=low'));
  });
});
