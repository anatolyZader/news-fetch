import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  scoreComponents,
  overallScore,
  COMPONENT_TUNING,
} from '../../../business_modules/resilience_scorer/app/scoringFacade.js';

describe('scoringFacade', () => {
  it('returns scored component shape from analyst scoring', () => {
    const scored = scoreComponents([], { totalArticles: 0 });
    assert.ok(scored.narrative);
    assert.equal(scored.narrative.score, null);
    assert.equal(scored.narrative.confidence, 'insufficient_data');
  });

  it('exports analyst tuning constants', () => {
    assert.ok(COMPONENT_TUNING.narrative?.tanhK);
  });

  it('overallScore is null when no evidence', () => {
    const scored = scoreComponents([], { totalArticles: 0 });
    assert.equal(overallScore(scored), null);
  });
});
