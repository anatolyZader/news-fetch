import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  componentNeedsSuppressionCompliance,
  formatSuppressionTraceTag,
  formatSuppressionDataQualityBlock,
  caveatReferencesSuppressionReason,
  validateSuppressionCompliance,
  validateComponentSuppressionCompliance,
} from '../../../../../../business_modules/resilience/domain/services/narrativeGrounding/index.js';

const capBoundScored = {
  score: 7,
  score_raw: 9,
  score_headline: 7,
  suppression_delta: 2,
  source_cap_binding: true,
  positive_evidence: 8,
  negative_evidence: 1,
  suppression_breakdown: { source_cap: -2, min_mass_floor: null },
  derived_indicators: {
    dominant_outlet_key: 'ynet.co.il',
    outlet_concentration_warning: true,
  },
  signals: [
    {
      signal_type: 'resilience_narrative_positive',
      article_source: 'ynet.co.il',
      _contribution: 0.7,
      _contribution_raw: 2.1,
      _cap_layer: 'article_source',
    },
  ],
};

describe('componentNeedsSuppressionCompliance', () => {
  it('true when source_cap effect >= 0.5 without binding', () => {
    assert.equal(componentNeedsSuppressionCompliance({
      suppression_delta: 0.3,
      source_cap_binding: false,
      suppression_breakdown: { source_cap: -0.8, min_mass_floor: null },
    }), true);
  });

  it('false when no suppression signals', () => {
    assert.equal(componentNeedsSuppressionCompliance({ score: 5, suppression_delta: 0 }), false);
  });
});

describe('formatSuppressionTraceTag', () => {
  it('emits trace for cap effect without binding', () => {
    const tag = formatSuppressionTraceTag({
      score_raw: 8,
      score_headline: 7,
      suppression_delta: 1,
      source_cap_binding: false,
      suppression_breakdown: { source_cap: -1, min_mass_floor: null },
    });
    assert.match(tag, /SUPPRESSION_TRACE/);
    assert.match(tag, /source_cap_effect=-1/);
  });
});

describe('formatSuppressionDataQualityBlock', () => {
  it('includes dominant outlet and contributors', () => {
    const block = formatSuppressionDataQualityBlock(capBoundScored);
    assert.match(block, /dominant_outlet=ynet\.co\.il/);
    assert.match(block, /Top contributors/);
    assert.match(block, /raw=2\.10/);
  });
});

describe('validateSuppressionCompliance', () => {
  it('rejects missing data_quality_caveat', () => {
    const result = validateSuppressionCompliance({
      components: [{
        component_id: 'narrative',
        narrative: 'Reporting describes positive coping narratives.',
        data_quality_caveat: '',
      }],
    }, { narrative: capBoundScored });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('data_quality_caveat required')));
  });

  it('rejects psych speculation', () => {
    const result = validateComponentSuppressionCompliance({
      data_quality_caveat: 'Headline limited by single-source concentration from ynet.co.il.',
      narrative: 'Beneath the surface, hidden anxiety persists despite positive reporting.',
    }, capBoundScored);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('psych speculation')));
  });

  it('accepts valid caveat and behavioral narrative', () => {
    const result = validateComponentSuppressionCompliance({
      data_quality_caveat: 'Headline score limited by source cap on ynet.co.il concentration; raw signal stream was higher.',
      narrative: 'Reporting describes residents citing effective coping and shelter compliance.',
    }, capBoundScored);
    assert.equal(result.ok, true);
  });

  it('caveatReferencesSuppressionReason matches outlet', () => {
    assert.equal(
      caveatReferencesSuppressionReason('Limited by ynet.co.il source cap.', capBoundScored),
      true,
    );
  });
});
