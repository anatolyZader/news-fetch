import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  synthesizeOovScoringSignals,
  isOovScoringEnabled,
} from '../../../../../business_modules/resilience_scorer/domain/services/oovScoringSignals.js';

describe('oovScoringSignals', () => {
  it('is enabled by default', () => {
    const prev = process.env.RESILIENCE_OOV_SCORING;
    delete process.env.RESILIENCE_OOV_SCORING;
    try {
      assert.equal(isOovScoringEnabled(), true);
    } finally {
      if (prev === undefined) delete process.env.RESILIENCE_OOV_SCORING;
      else process.env.RESILIENCE_OOV_SCORING = prev;
    }
  });

  it('synthesizes signals from alerting clusters', () => {
    const oovBurst = {
      alert: true,
      cluster_threshold: 3,
      top_clusters: [{
        key: 'cluster-1',
        label: 'drone, delivery, insulin',
        count: 5,
        sample_evidence: ['Residents use drones to deliver insulin to elderly.'],
        dominant_source_class: 'social',
        high_salience: true,
      }],
    };
    const { signals, applied } = synthesizeOovScoringSignals(oovBurst, {
      reportDate: '2026-05-29',
    });
    assert.equal(signals.length, 1);
    assert.equal(signals[0].signal_type, 'novel_behavior_observed');
    assert.equal(signals[0].oov_synthetic, true);
    assert.equal(applied?.synthetic_count, 1);
  });

  it('returns empty when alert is false', () => {
    const { signals } = synthesizeOovScoringSignals({ alert: false, top_clusters: [] });
    assert.equal(signals.length, 0);
  });
});
