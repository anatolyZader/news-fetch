import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeCalibrationTrust,
  shrinkScoreToNeutral,
  enrichWithCalibrationPenalty,
} from '../../business_modules/resilience_scorer/analyst/calibrationPenalty.js';

describe('calibrationPenalty', () => {
  it('trust is zero with empty maturity', () => {
    const trust = computeCalibrationTrust(null);
    assert.equal(trust, 0.08); // 0.2 * 0.4 weightsFactor only
  });

  it('trust approaches 1 with full maturity and fitted weights', () => {
    const trust = computeCalibrationTrust({
      collection: { record_count: 30 },
      tier_readiness: {
        tier4_construct: { expert_label_fill_rate: 100 },
      },
    }, { weightsStatus: 'fitted' });
    assert.equal(trust, 1);
  });

  it('shrinkScoreToNeutral at trust=0 returns neutral rounded', () => {
    assert.equal(shrinkScoreToNeutral(8, 0), 6); // 5.5 rounds to 6
  });

  it('shrinkScoreToNeutral at trust=1 preserves score', () => {
    assert.equal(shrinkScoreToNeutral(8, 1), 8);
  });

  it('enrichWithCalibrationPenalty adds score_calibrated per component', () => {
    const { scored, calibration, overall_score_calibrated } = enrichWithCalibrationPenalty({
      narrative: { score: 8, certainty: 0.5 },
      leadership: { score: null, certainty: 0 },
    }, { collection: { record_count: 0 } });

    assert.ok(calibration.deficit > 0);
    assert.equal(scored.narrative.score, 8);
    assert.ok(scored.narrative.score_calibrated != null);
    assert.ok(scored.narrative.score_calibrated < 8);
    assert.equal(scored.leadership.score_calibrated, null);
    assert.ok(overall_score_calibrated != null);
  });
});
