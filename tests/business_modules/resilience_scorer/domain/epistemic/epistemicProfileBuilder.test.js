import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeEpistemicProfile } from '../../../../../business_modules/resilience_scorer/domain/epistemic/epistemicProfileBuilder.js';

describe('epistemicProfileBuilder', () => {
  it('marks thin evidence when mass low', () => {
    const profile = computeEpistemicProfile([], { totalArticles: 10, reportDate: '2026-06-01' });
    assert.equal(profile.by_component.leadership.thin_evidence, true);
  });

  it('computes media_mention_mass from press signals', () => {
    const profile = computeEpistemicProfile([
      {
        signal_type: 'information_clarity',
        source_type: 'news',
        extraction_confidence: 1,
        evidence: 'test',
      },
    ], {
      totalArticles: 10,
      reportDate: '2026-06-01',
    });
    assert.ok(profile.by_component.information_communication.media_mention_mass > 0);
  });
});
