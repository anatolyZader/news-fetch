import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeEpistemicProfile } from '../../../../../business_modules/resilience_scorer/domain/epistemic/epistemicProfileBuilder.js';

describe('epistemicProfileBuilder', () => {
  it('marks thin evidence when no signals', () => {
    const profile = computeEpistemicProfile([], { reportDate: '2026-06-01' });
    assert.equal(profile.by_component.leadership.thin_evidence, true);
    assert.equal(profile.by_component.leadership.signal_count, 0);
    assert.equal(profile.by_component.leadership.sufficiency, 'none');
  });

  it('counts press signals into the routed component', () => {
    const profile = computeEpistemicProfile([
      {
        signal_type: 'information_clarity',
        source_type: 'news',
        article_source: 'ynet.co.il',
        article_url: 'https://ynet.co.il/a1',
        extraction_confidence: 1,
        evidence: 'test',
      },
    ], {
      reportDate: '2026-06-01',
    });
    const comp = profile.by_component.information_communication;
    assert.equal(comp.signal_count, 1);
    assert.equal(comp.thin_evidence, true);
    assert.equal(comp.positive_count, 1);
    // Compat alias mirrors the signal count (no evidence mass anymore).
    assert.equal(comp.evidence_mass, comp.signal_count);
  });

  it('requires corroboration for thin components via retrieval policies', () => {
    const profile = computeEpistemicProfile([], { reportDate: '2026-06-01' });
    assert.ok(profile.retrieval_policies.require_corroboration.some(
      (p) => p.component_id === 'leadership' && p.claim_type === 'any',
    ));
  });
});
