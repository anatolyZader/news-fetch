import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEMOTED_EVIDENCE_CAP,
  TOP_CONTRIBUTOR_CAP,
  demotedEvidenceFromScored,
  topContributorsFromScored,
} from '../../../../../business_modules/resilience_scorer/domain/services/user/topContributors.js';

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
      evidence_type: null,
      confidence: null,
      grounding_tier: 'grounded',
      grounding_reason: null,
      intensity: 'moderate',
      _polarity: '-',
    });
    assert.equal('_contribution' in entry, false);
  });
});

// Reproduces the production shape: slimSignal used to drop evidence_type and
// temporal_weight and pin intensity to 'moderate', so every grounded primary
// row scored identically, the stable sort preserved array order, and the
// surface became "the alphabetically-first municipalities".
const uniformGroundedPrimaries = (n) =>
  Array.from({ length: n }, (_, i) => ({
    signal_type: 'leadership_clear_guidance',
    grounding_tier: 'grounded',
    routing_role: 'primary',
    intensity: 'moderate',
    article_source: `pbo-${String.fromCharCode(97 + i)}`,
    evidence_snippet: `municipality ${i}`,
  }));

describe('contributor ranking does not degenerate to input order', () => {
  it('separates rows that differ only by extraction confidence', () => {
    const signals = uniformGroundedPrimaries(4);
    signals[0].confidence = 0.65;
    signals[3].confidence = 0.95;

    const top = topContributorsFromScored({ signals }, 'leadership');
    assert.equal(top[0].article_source, 'pbo-d', 'highest-confidence row must lead');
    assert.equal(top.at(-1).article_source, 'pbo-a', 'lowest-confidence row must trail');
  });

  it('surfaces a critical signal that would otherwise be cut by the cap', () => {
    // A presence-gate signal sitting past the cap inside an all-ties block was
    // silently dropped from the report while the gate itself fired.
    const signals = uniformGroundedPrimaries(TOP_CONTRIBUTOR_CAP + 4);
    signals.push({
      signal_type: 'protective_infrastructure_absent',
      grounding_tier: 'grounded',
      routing_role: 'primary',
      article_source: 'pbo-critical',
      evidence_snippet: 'no protected clinic',
    });

    const top = topContributorsFromScored({ signals }, 'lifesaving_behavior');
    assert.equal(top.length, TOP_CONTRIBUTOR_CAP);
    assert.equal(top[0].signal_type, 'protective_infrastructure_absent');
  });

  it('does not pad the list with rows that belong to the demoted block', () => {
    // The two surfaces partition the evidence; a row shown in both would be
    // counted twice by any reader tallying the component.
    const signals = [
      ...uniformGroundedPrimaries(3),
      { signal_type: 'leadership_clear_guidance', grounding_tier: 'weak', article_source: 'x' },
    ];
    const top = topContributorsFromScored({ signals }, 'leadership');
    assert.equal(top.length, 3);
    assert.ok(!top.some((t) => t.grounding_tier === 'weak'));
    assert.equal(demotedEvidenceFromScored({ signals }, 'leadership').total, 1);
  });

  it('never lets criticality promote an unverified signal above a grounded one', () => {
    // The band widths only hold if criticality (50) stays under grounding (100):
    // top_contributors must remain the verified surface, or the demoted block
    // stops meaning anything.
    const signals = [
      {
        signal_type: 'non_compliance_ignore_guidelines',
        evidence_type: 'direct_quote_named_person',
        intensity: 'severe',
        confidence: 0.95,
        grounding_tier: 'unverified_critical',
      },
      { signal_type: 'leadership_clear_guidance', grounding_tier: 'grounded', confidence: 0.65 },
      { signal_type: 'leadership_clear_guidance', grounding_tier: 'grounded' },
    ];
    const top = topContributorsFromScored({ signals }, 'lifesaving_behavior');
    assert.equal(top[0].grounding_tier, 'grounded');
  });

  it('ranks a named quote above an observational note of equal tier', () => {
    const signals = uniformGroundedPrimaries(3);
    signals[2].evidence_type = 'direct_quote_named_person';
    signals[0].evidence_type = 'observational_reported_fact';

    const top = topContributorsFromScored({ signals }, 'leadership');
    assert.equal(top[0].evidence_type, 'direct_quote_named_person');
  });
});

describe('demotedEvidenceFromScored', () => {
  const signals = [
    { signal_type: 'leadership_clear_guidance', grounding_tier: 'grounded' },
    {
      signal_type: 'compliance_follow_instructions',
      grounding_tier: 'weak',
      grounding_reason: 'low_similarity',
      evidence_snippet: 'residents follow guidelines',
    },
    {
      signal_type: 'non_compliance_ignore_guidelines',
      grounding_tier: 'unverified_critical',
      grounding_reason: 'verification_failed_critical',
      evidence_snippet: 'some residents show apathy',
    },
  ];

  it('keeps below-tier evidence visible with its tier and reason', () => {
    const block = demotedEvidenceFromScored({ signals }, 'lifesaving_behavior');
    assert.equal(block.total, 2);
    assert.deepEqual(block.counts, { weak: 1, unverified_critical: 1 });
    assert.equal(block.excluded_from_narrative, true);
    assert.ok(block.items.every((i) => i.grounding_reason != null));
  });

  it('names the critical types it is holding back', () => {
    const block = demotedEvidenceFromScored({ signals }, 'lifesaving_behavior');
    assert.deepEqual(block.critical_types_suppressed, ['non_compliance_ignore_guidelines']);
  });

  it('reports an uncapped signal-type histogram so systemic gaps stay legible', () => {
    const block = demotedEvidenceFromScored({ signals }, 'lifesaving_behavior');
    assert.deepEqual(block.signal_types, {
      compliance_follow_instructions: 1,
      non_compliance_ignore_guidelines: 1,
    });
  });

  it('excludes grounded rows, which the contributor surface already carries', () => {
    const block = demotedEvidenceFromScored({ signals }, 'lifesaving_behavior');
    assert.ok(!block.items.some((i) => i.grounding_tier === 'grounded'));
  });

  it('reports the true total even when items are capped', () => {
    const many = Array.from({ length: DEMOTED_EVIDENCE_CAP + 7 }, () => ({
      signal_type: 'compliance_follow_instructions',
      grounding_tier: 'weak',
      grounding_reason: 'low_similarity',
    }));
    const block = demotedEvidenceFromScored({ signals: many }, 'lifesaving_behavior');
    assert.equal(block.items.length, DEMOTED_EVIDENCE_CAP);
    assert.equal(block.total, DEMOTED_EVIDENCE_CAP + 7);
    assert.equal(block.counts.weak, DEMOTED_EVIDENCE_CAP + 7);
  });

  it('returns null when nothing was demoted', () => {
    const clean = [{ signal_type: 'leadership_clear_guidance', grounding_tier: 'grounded' }];
    assert.equal(demotedEvidenceFromScored({ signals: clean }, 'leadership'), null);
  });
});

function shelterFiller(i) {
  return {
    signal_type: 'compliance_enter_shelter',
    evidence: `Shelter compliance ${i}`,
    grounding_tier: 'grounded',
    confidence: 0.9,
  };
}

describe('topContributorsFromScored — presence gate pinning', () => {
  it('pins the gate-triggering row even when it ranks below the cap', () => {
    const gateRow = {
      signal_type: 'non_compliance_ignore_guidelines',
      evidence: 'Vehicles kept driving during the siren',
      grounding_tier: 'grounded',
      confidence: 0.1,
      presence_gate_trigger: 'critical_non_compliance_ignore_guidelines',
    };
    const scored = { signals: [...Array.from({ length: 20 }, (_, i) => shelterFiller(i)), gateRow] };
    const rows = topContributorsFromScored(scored, 'lifesaving_behavior');
    assert.equal(rows.length, TOP_CONTRIBUTOR_CAP);
    assert.equal(rows[0].signal_type, 'non_compliance_ignore_guidelines');
    assert.equal(rows[0].presence_gate_trigger, 'critical_non_compliance_ignore_guidelines');
  });

  it('does not duplicate a pinned row that would have ranked anyway', () => {
    const gateRow = {
      signal_type: 'non_compliance_ignore_guidelines',
      evidence: 'Vehicles kept driving during the siren',
      grounding_tier: 'grounded',
      confidence: 0.99,
      presence_gate_trigger: 'critical_non_compliance_ignore_guidelines',
    };
    const scored = { signals: [gateRow, shelterFiller(1), shelterFiller(2)] };
    const rows = topContributorsFromScored(scored, 'lifesaving_behavior');
    const gateRows = rows.filter((r) => r.presence_gate_trigger);
    assert.equal(gateRows.length, 1);
    assert.equal(rows.length, 3);
  });
});
