import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { synthesizeOpenEvidenceScoringSignals } from '../../../../../business_modules/resilience_scorer/domain/services/openEvidenceScoringSignals.js';

describe('openEvidenceScoringSignals', () => {
  it('builds discounted synthetic signals from verified claims', () => {
    const { signals, applied } = synthesizeOpenEvidenceScoringSignals(
      [{
        observation_id: 'obs-1',
        component_id: 'community_capital',
        claim_id: 'community_capital:c1',
        corroboration_level: 'multi_hop',
        observation: {
          observation_id: 'obs-1',
          evidence: 'Volunteers delivered food',
          suggested_catalog_types: ['mutual_aid_observed'],
          source_type: 'news',
        },
      }],
      [],
      { env: { RESILIENCE_OPEN_EVIDENCE_SCORING: '1', RESILIENCE_OMISSION_AUDIT: '0', RESILIENCE_OPEN_EVIDENCE_SCORE_WEIGHT: '0.4' } },
    );

    assert.equal(signals.length, 1);
    assert.equal(signals[0].open_evidence_synthetic, true);
    assert.equal(signals[0].signal_type, 'mutual_aid_observed');
    assert.equal(applied.synthetic_signal_count, 1);
  });
});
