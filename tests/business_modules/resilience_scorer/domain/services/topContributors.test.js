import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { topContributorsFromScored } from '../../../../../business_modules/resilience_scorer/domain/services/operator/topContributors.js';

describe('topContributorsFromScored', () => {
  it('prefers strong catalog links over weak links', () => {
    const scored = {
      signals: [
        {
          signal_type: 'compliance_enter_shelter',
          evidence: 'Shelter compliance',
        },
        {
          signal_type: 'leadership_visible_presence',
          evidence: 'Mayor visible daily',
        },
        {
          signal_type: 'leadership_clear_guidance',
          evidence: 'Clear municipal guidance',
        },
        {
          signal_type: 'symbolic_vs_substantive_action',
          evidence: 'Photo-op only',
        },
      ],
    };

    const top = topContributorsFromScored(scored, 'leadership');
    // Three primary-edge signals exist, so the weak spillover link is filtered out.
    assert.equal(top.length, 3);
    assert.ok(!top.some((t) => t.signal_type === 'compliance_enter_shelter'));
    // Discrete roles carry no magnitude tiebreak: equal-rank items keep input order.
    assert.deepEqual(
      top.map((t) => t.signal_type),
      ['leadership_visible_presence', 'leadership_clear_guidance', 'symbolic_vs_substantive_action'],
    );
  });

  it('falls back to full pool ranking when fewer than three strong links exist', () => {
    const scored = {
      signals: [
        { signal_type: 'compliance_enter_shelter', grounding_tier: 'grounded' },
        { signal_type: 'service_continuity' },
      ],
    };
    const top = topContributorsFromScored(scored, 'leadership');
    assert.equal(top.length, 2);
    // Grounded signals dominate the rank key even with a weak catalog link.
    assert.equal(top[0].signal_type, 'compliance_enter_shelter');
  });

  it('ranks by grounding, evidence class, then intensity', () => {
    const scored = {
      signals: [
        {
          signal_type: 'leadership_visible_presence',
          evidence_type: 'observational_reported_fact',
          intensity: 'severe',
        },
        {
          signal_type: 'leadership_visible_presence',
          evidence_type: 'direct_quote_named_person',
          intensity: 'light',
        },
        {
          signal_type: 'leadership_visible_presence',
          evidence_type: 'direct_quote_named_person',
          intensity: 'light',
          grounding_tier: 'grounded',
        },
      ],
    };
    const top = topContributorsFromScored(scored, 'leadership');
    assert.equal(top[0].grounding_tier, 'grounded');
    assert.equal(top[1].evidence_type ?? 'direct_quote_named_person', 'direct_quote_named_person');
    assert.equal(top[1].intensity, 'light');
    assert.equal(top[2].intensity, 'severe');
  });

  it('ranks a fresh signal above an equally-graded stale one', () => {
    const scored = {
      signals: [
        {
          signal_type: 'leadership_visible_presence',
          evidence: 'stale visit',
          evidence_type: 'observational_reported_fact',
          intensity: 'moderate',
          temporal_weight: 0.2,
        },
        {
          signal_type: 'leadership_visible_presence',
          evidence: 'fresh visit',
          evidence_type: 'observational_reported_fact',
          intensity: 'moderate',
          temporal_weight: 1,
        },
        {
          signal_type: 'leadership_clear_guidance',
          evidence: 'third strong link',
        },
      ],
    };
    const top = topContributorsFromScored(scored, 'leadership');
    const freshIdx = top.findIndex((t) => t.evidence === 'fresh visit');
    const staleIdx = top.findIndex((t) => t.evidence === 'stale visit');
    assert.ok(freshIdx >= 0 && staleIdx >= 0);
    assert.ok(freshIdx < staleIdx, 'fresh signal must outrank the equally-graded stale one');
  });

  it('never lets freshness outrank grounding or a higher evidence class', () => {
    const scored = {
      signals: [
        {
          signal_type: 'leadership_visible_presence',
          evidence: 'fresh weak',
          evidence_type: 'observational_reported_fact',
          temporal_weight: 1,
        },
        {
          signal_type: 'leadership_visible_presence',
          evidence: 'stale grounded quote',
          evidence_type: 'direct_quote_named_person',
          grounding_tier: 'grounded',
          temporal_weight: 0.2,
        },
        {
          signal_type: 'leadership_clear_guidance',
          evidence: 'third strong link',
        },
      ],
    };
    const top = topContributorsFromScored(scored, 'leadership');
    assert.equal(top[0].evidence, 'stale grounded quote');
  });

  it('emits display fields without contribution numbers', () => {
    const scored = {
      signals: [{
        signal_type: 'leadership_clear_guidance',
        source_type: 'press',
        article_source: 'ynet.co.il',
        article_url: 'https://ynet.co.il/x',
        evidence_snippet: 'Snippet only',
        grounding_tier: 'grounded',
        intensity: 'moderate',
        _polarity: '-',
      }],
    };
    const [entry] = topContributorsFromScored(scored, 'leadership');
    assert.deepEqual(entry, {
      signal_type: 'leadership_clear_guidance',
      source_type: 'press',
      article_source: 'ynet.co.il',
      article_url: 'https://ynet.co.il/x',
      evidence: 'Snippet only',
      grounding_tier: 'grounded',
      intensity: 'moderate',
      _polarity: '-',
    });
    assert.equal('_contribution' in entry, false);
  });
});
