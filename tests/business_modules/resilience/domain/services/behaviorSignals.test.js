import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  SIGNAL_CATALOG,
  SIGNAL_TO_COMPONENTS,
  SIGNAL_TYPES,
  scoreComponents,
  overallScore,
  assertCatalogPolarityCoherence,
} from '../../../../../business_modules/resilience/domain/services/behaviorSignals.js';
import { COMPONENT_FACETS } from '../../../../../business_modules/resilience/domain/services/componentFacets.js';
import { summarizeSubgroupCoverage } from '../../../../../business_modules/resilience/domain/services/assessmentMethodology.js';

function makeSignal(overrides = {}) {
  return {
    article_index: 1,
    article_url: 'https://example.com/a1',
    article_source: 'src1',
    source_type: 'news',
    signal_type: 'information_clarity',
    evidence_type: 'observational_reported_fact',
    evidence: 'Officials posted clear shelter instructions.',
    scope_level: 'repeated_pattern',
    temporal_weight: 1.0,
    ...overrides,
  };
}

function repeat(n, fn) {
  return Array.from({ length: n }, (_, i) => fn(i));
}

describe('SIGNAL_CATALOG / SIGNAL_TO_COMPONENTS — T1 + T2 additions', () => {
  it('includes all new positive-counterpart signal types (T1)', () => {
    const types = SIGNAL_CATALOG.map((s) => s.type);
    for (const t of [
      'coordination_success',
      'local_capacity_demonstrated',
      'rumor_correction',
      'system_resilience_under_load',
      'post_event_recovery_indicator',
    ]) {
      assert.ok(types.includes(t), `missing T1 signal type: ${t}`);
      assert.ok(SIGNAL_TO_COMPONENTS[t], `missing mapping for T1 signal: ${t}`);
    }
  });

  it('includes all new fine-grained signal types (T2)', () => {
    const types = SIGNAL_CATALOG.map((s) => s.type);
    for (const t of [
      'information_inclusivity_present',
      'information_inclusivity_gap',
      'feedback_loop_closure',
      'economic_continuity',
      'economic_disruption',
      'cultural_continuity',
    ]) {
      assert.ok(types.includes(t), `missing T2 signal type: ${t}`);
      assert.ok(SIGNAL_TO_COMPONENTS[t], `missing mapping for T2 signal: ${t}`);
    }
  });

  it('routes coordination_success into leadership/community/continuity', () => {
    const m = SIGNAL_TO_COMPONENTS.coordination_success;
    assert.ok(m.leadership > 0);
    assert.ok(m.community_capital > 0);
    assert.ok(m.functional_continuity > 0);
  });

  it('T3 spillover: harm_to_population touches narrative negatively and no longer spills into belonging (B1)', () => {
    const m = SIGNAL_TO_COMPONENTS.harm_to_population;
    assert.ok(m.narrative < 0);
    assert.equal(m.belonging_solidarity, undefined,
      'B1: harm should not auto-boost belonging — solidarity must be evidenced via solidarity_help_others');
  });

  it('B1: harm-only batch must NOT lift belonging_solidarity', () => {
    // 5 harm signals, zero solidarity signals — under the old +0.2 spillover this would
    // bump belonging_solidarity above its insufficient_data floor.
    const sigs = repeat(5, (i) => makeSignal({
      article_url: `https://x.com/h${i}`,
      article_index: i + 1,
      source_type: ['news', 'radio'][i % 2],
      signal_type: 'harm_to_population',
      evidence_type: 'named_institutional_fact',
      scope_level: 'quantified_or_broad',
    }));
    const scored = scoreComponents(sigs, { totalArticles: 5 });
    assert.equal(scored.belonging_solidarity.score, null,
      'B1: harm alone should not produce a belonging score; it must remain insufficient_data');
    assert.equal(scored.belonging_solidarity.confidence, 'insufficient_data');
    assert.ok(scored.wellbeing_atrisk.score != null,
      'wellbeing_atrisk should still register the harm signal');
  });

  it('A1: 4 phantom-prompt signal types now exist in the catalog', () => {
    const types = SIGNAL_CATALOG.map((s) => s.type);
    for (const t of [
      'political_distrust',
      'leadership_credibility_loss',
      'evacuation_displacement',
      'routine_disruption',
    ]) {
      assert.ok(types.includes(t), `missing A1 signal type: ${t}`);
      assert.ok(SIGNAL_TO_COMPONENTS[t], `missing routing for A1 signal: ${t}`);
    }
    assert.ok(SIGNAL_TO_COMPONENTS.political_distrust.leadership < 0);
    assert.ok(SIGNAL_TO_COMPONENTS.leadership_credibility_loss.leadership < 0);
    assert.ok(SIGNAL_TO_COMPONENTS.evacuation_displacement.functional_continuity < 0);
    assert.ok(SIGNAL_TO_COMPONENTS.routine_disruption.functional_continuity < 0);
  });

  it('T3 spillover: fear_expression touches narrative negatively', () => {
    const m = SIGNAL_TO_COMPONENTS.fear_expression;
    assert.ok(m.narrative < 0);
  });

  it('Norris: new signal types exist and route to intended components', () => {
    const types = SIGNAL_CATALOG.map((s) => s.type);
    for (const t of [
      // Information & communication
      'trusted_information_source',
      'mistrusted_information_source',
      'feedback_channel_open',
      'feedback_channel_blocked',
      // Community competence
      'consensus_on_priorities',
      'dissensus_blocks_action',
      'conflict_resolution',
      // Rapidity
      'rapid_mobilization',
      'delayed_mobilization',
      // Equity
      'inequitable_resource_access',
      'equitable_resource_distribution',
    ]) {
      assert.ok(types.includes(t), `missing Norris signal type: ${t}`);
      assert.ok(SIGNAL_TO_COMPONENTS[t], `missing mapping for Norris signal: ${t}`);
    }

    assert.ok(SIGNAL_TO_COMPONENTS.trusted_information_source.information_communication > 0);
    assert.ok(SIGNAL_TO_COMPONENTS.mistrusted_information_source.information_communication < 0);

    assert.ok(SIGNAL_TO_COMPONENTS.feedback_channel_open.information_communication > 0);
    assert.ok(SIGNAL_TO_COMPONENTS.feedback_channel_open.leadership > 0);

    assert.ok(SIGNAL_TO_COMPONENTS.consensus_on_priorities.leadership > 0);
    assert.ok(SIGNAL_TO_COMPONENTS.dissensus_blocks_action.leadership < 0);

    assert.ok(SIGNAL_TO_COMPONENTS.conflict_resolution.community_capital > 0);
    assert.ok(SIGNAL_TO_COMPONENTS.conflict_resolution.belonging_solidarity > 0);

    assert.ok(SIGNAL_TO_COMPONENTS.rapid_mobilization.functional_continuity > 0);
    assert.ok(SIGNAL_TO_COMPONENTS.delayed_mobilization.functional_continuity < 0);

    assert.ok(SIGNAL_TO_COMPONENTS.inequitable_resource_access.wellbeing_atrisk < 0);
    assert.ok(SIGNAL_TO_COMPONENTS.equitable_resource_distribution.community_capital > 0);
  });
});

describe('scoreComponents — diversity factors (4a)', () => {
  it('source diversity factor is higher with more distinct sources', () => {
    // Hand-construct two evidence sets with the SAME total mass but different source diversity.
    const single = repeat(8, (i) => makeSignal({
      article_url: `https://x.com/single/${i}`,
      article_index: i + 1,
      source_type: 'news',
      signal_type: 'information_clarity',
    }));
    const diverse = repeat(8, (i) => makeSignal({
      article_url: `https://x.com/diverse/${i}`,
      article_index: i + 1,
      source_type: ['news', 'radio', 'field', 'pbo'][i % 4],
      signal_type: 'information_clarity',
    }));

    const scoredSingle = scoreComponents(single, { totalArticles: 8 });
    const scoredDiverse = scoreComponents(diverse, { totalArticles: 8 });

    assert.ok(
      scoredDiverse.information_communication.source_diversity_factor >
      scoredSingle.information_communication.source_diversity_factor,
      'diverse source set should yield higher source_diversity_factor',
    );
    assert.equal(scoredSingle.information_communication.source_diversity, 1);
    assert.equal(scoredDiverse.information_communication.source_diversity, 4);
  });

  it('signal-type entropy factor is higher with more varied signal types', () => {
    const oneType = repeat(6, (i) => makeSignal({
      article_url: `https://x.com/u/${i}`,
      article_index: i + 1,
      source_type: 'news',
      signal_type: 'information_clarity',
    }));
    const variedTypes = [
      'information_clarity',
      'active_information_seeking',
      'information_actionable_effective',
      'rumor_correction',
      'feedback_loop_closure',
      'information_inclusivity_present',
    ].map((t, i) => makeSignal({
      article_url: `https://x.com/v/${i}`,
      article_index: i + 1,
      source_type: 'news',
      signal_type: t,
    }));

    const scoredOne = scoreComponents(oneType, { totalArticles: 6 });
    const scoredVar = scoreComponents(variedTypes, { totalArticles: 6 });

    assert.ok(
      scoredVar.information_communication.type_diversity_factor >
      scoredOne.information_communication.type_diversity_factor,
    );
  });
});

describe('scoreComponents — polarization (4b)', () => {
  it('returns polarization ≈ 1 when positive and negative are balanced', () => {
    const sigs = [
      ...repeat(4, (i) => makeSignal({
        article_url: `https://x.com/p/${i}`,
        article_index: i + 1,
        signal_type: 'resilience_narrative_positive',
      })),
      ...repeat(4, (i) => makeSignal({
        article_url: `https://x.com/n/${i}`,
        article_index: 100 + i,
        source_type: 'radio',
        signal_type: 'resilience_narrative_negative',
      })),
    ];
    const scored = scoreComponents(sigs, { totalArticles: 8 });
    assert.ok(scored.narrative.polarization > 0.85, `expected polarization > 0.85, got ${scored.narrative.polarization}`);
  });

  it('returns polarization ≈ 0 when evidence is one-sided', () => {
    const sigs = repeat(8, (i) => makeSignal({
      article_url: `https://x.com/onesided/${i}`,
      article_index: i + 1,
      source_type: ['news', 'radio'][i % 2],
      signal_type: 'resilience_narrative_positive',
    }));
    const scored = scoreComponents(sigs, { totalArticles: 8 });
    assert.equal(scored.narrative.polarization, 0);
  });
});

describe('scoreComponents — per-source cap (4f)', () => {
  it('caps single-source dominance: doubling signals from same source does not double impact', () => {
    // Two sources, equal contributions: net = (4 from news) + (4 from radio), both positive.
    const balanced = [
      ...repeat(4, (i) => makeSignal({
        article_url: `https://x.com/b1/${i}`,
        article_index: i + 1,
        source_type: 'news',
        signal_type: 'resilience_narrative_positive',
      })),
      ...repeat(4, (i) => makeSignal({
        article_url: `https://x.com/b2/${i}`,
        article_index: 100 + i,
        source_type: 'radio',
        signal_type: 'resilience_narrative_positive',
      })),
    ];
    // Same total signal count but skewed: 7 news / 1 radio.
    const skewed = [
      ...repeat(7, (i) => makeSignal({
        article_url: `https://x.com/s1/${i}`,
        article_index: i + 1,
        source_type: 'news',
        signal_type: 'resilience_narrative_positive',
      })),
      makeSignal({
        article_url: 'https://x.com/s2/0',
        article_index: 100,
        source_type: 'radio',
        signal_type: 'resilience_narrative_positive',
      }),
    ];
    const sBalanced = scoreComponents(balanced, { totalArticles: 8 });
    const sSkewed = scoreComponents(skewed, { totalArticles: 8 });

    // With cap, skewed should NOT outscore balanced — even though raw signal mass is identical.
    // The per-source cap brings the news contribution down to equal radio's.
    assert.ok(
      sSkewed.narrative.score <= sBalanced.narrative.score,
      `skewed score ${sSkewed.narrative.score} should be <= balanced ${sBalanced.narrative.score}`,
    );
  });

  it('does not apply cap when only one source is present', () => {
    const sigs = repeat(6, (i) => makeSignal({
      article_url: `https://x.com/single/${i}`,
      article_index: i + 1,
      source_type: 'news',
      signal_type: 'resilience_narrative_positive',
    }));
    const scored = scoreComponents(sigs, { totalArticles: 6 });
    // Source-only set: positive_evidence should be the un-capped sum
    assert.ok(scored.narrative.positive_evidence > 0);
    assert.equal(scored.narrative.source_diversity, 1);
  });
});

describe('scoreComponents — minimum-mass floor (4f)', () => {
  it('clamps a thin single-signal score into [3, 8]', () => {
    const single = [
      makeSignal({
        signal_type: 'resilience_narrative_negative',
        scope_level: 'single_case',
        evidence_type: 'observational_reported_fact',
      }),
    ];
    const scored = scoreComponents(single, { totalArticles: 1 });
    assert.ok(scored.narrative.evidence_mass < 1.5);
    assert.ok(scored.narrative.score >= 3 && scored.narrative.score <= 8,
      `expected score in [3,8], got ${scored.narrative.score}`);
  });

  it('C7: surfaces floor_clamped when the floor actually constrains the score', () => {
    const single = [
      makeSignal({
        signal_type: 'resilience_narrative_negative',
        scope_level: 'single_case',
        evidence_type: 'observational_reported_fact',
      }),
    ];
    const scored = scoreComponents(single, { totalArticles: 1 });
    assert.ok(scored.narrative.evidence_mass < 1.5);
    assert.equal(typeof scored.narrative.floor_clamped, 'boolean');
  });

  it('C7: floor_clamped is false when the score sits inside the [3,8] band naturally', () => {
    const sigs = repeat(8, (i) => makeSignal({
      article_url: `https://x.com/fc/${i}`,
      article_index: i + 1,
      source_type: ['news', 'radio'][i % 2],
      signal_type: 'resilience_narrative_positive',
    }));
    const scored = scoreComponents(sigs, { totalArticles: 8 });
    assert.equal(scored.narrative.floor_clamped, false);
  });
});

describe('scoreComponents — B2 field-report scope default', () => {
  it('field signal without scope_level is treated as repeated_pattern (not single_case)', () => {
    const fieldNoScope = makeSignal({
      source_type: 'field',
      signal_type: 'service_continuity',
      scope_level: undefined,
    });
    const fieldRepeated = makeSignal({
      source_type: 'field',
      signal_type: 'service_continuity',
      scope_level: 'repeated_pattern',
    });
    const fieldSingle = makeSignal({
      source_type: 'field',
      signal_type: 'service_continuity',
      scope_level: 'single_case',
    });

    const a = scoreComponents([fieldNoScope], { totalArticles: 1 });
    const b = scoreComponents([fieldRepeated], { totalArticles: 1 });
    const c = scoreComponents([fieldSingle], { totalArticles: 1 });

    assert.equal(
      a.functional_continuity.evidence_mass,
      b.functional_continuity.evidence_mass,
      'field signal without scope_level should match repeated_pattern by default',
    );
    assert.ok(
      a.functional_continuity.evidence_mass > c.functional_continuity.evidence_mass,
      'field default should be heavier than single_case (B2 fix)',
    );
  });

  it('non-field signal without scope_level still defaults to single_case', () => {
    const newsNoScope = makeSignal({
      source_type: 'news',
      signal_type: 'service_continuity',
      scope_level: undefined,
    });
    const newsSingle = makeSignal({
      source_type: 'news',
      signal_type: 'service_continuity',
      scope_level: 'single_case',
    });
    const a = scoreComponents([newsNoScope], { totalArticles: 1 });
    const b = scoreComponents([newsSingle], { totalArticles: 1 });
    assert.equal(a.functional_continuity.evidence_mass, b.functional_continuity.evidence_mass);
  });
});

describe('scoreComponents — A5 pre-cap explainability', () => {
  it('attaches _contribution_raw alongside post-cap _contribution', () => {
    const sigs = [
      ...repeat(8, (i) => makeSignal({
        article_url: `https://ynet.co.il/${i}`,
        article_index: i + 1,
        source_type: 'news',
        article_source: 'ynet.co.il',
        signal_type: 'resilience_narrative_positive',
      })),
      makeSignal({
        article_url: 'https://kan.org.il/a',
        article_index: 100,
        source_type: 'radio',
        article_source: 'kan.org.il',
        signal_type: 'resilience_narrative_positive',
      }),
    ];
    const scored = scoreComponents(sigs, { totalArticles: 9 });
    const yneSignal = scored.narrative.signals.find((s) => s.article_source === 'ynet.co.il');
    assert.ok(typeof yneSignal._contribution_raw === 'number');
    assert.ok(typeof yneSignal._contribution === 'number');
    assert.ok(yneSignal._contribution_raw >= yneSignal._contribution,
      'pre-cap contribution should be >= post-cap (cap can only shrink)');
  });
});

describe('scoreComponents — bootstrap CI (4d)', () => {
  it('returns deterministic CIs that bracket the headline score', () => {
    const sigs = repeat(10, (i) => makeSignal({
      article_url: `https://x.com/ci/${i}`,
      article_index: i + 1,
      source_type: ['news', 'radio'][i % 2],
      signal_type: 'resilience_narrative_positive',
    }));
    const a = scoreComponents(sigs, { totalArticles: 10 });
    const b = scoreComponents(sigs, { totalArticles: 10 });
    assert.equal(a.narrative.score_low, b.narrative.score_low, 'CI low should be deterministic');
    assert.equal(a.narrative.score_high, b.narrative.score_high, 'CI high should be deterministic');
    assert.ok(a.narrative.score_low <= a.narrative.score, 'CI low ≤ headline score');
    assert.ok(a.narrative.score_high >= a.narrative.score, 'CI high ≥ headline score');
  });

  it('B6: stable CI on a well-supported component does NOT flag ci_unstable', () => {
    const sigs = repeat(10, (i) => makeSignal({
      article_url: `https://x.com/stable/${i}`,
      article_index: i + 1,
      source_type: ['news', 'radio'][i % 2],
      signal_type: 'resilience_narrative_positive',
    }));
    const scored = scoreComponents(sigs, { totalArticles: 10 });
    assert.equal(scored.narrative.ci_unstable, false);
  });
});

describe('scoreComponents — counterfactual (C3)', () => {
  it('reports a non-trivial delta when one article dominates the evidence', () => {
    // Use a single source_type so the per-source cap does not equalize per-article mass
    // (cap only applies when ≥2 sources). That way article-level dominance is unambiguous.
    const sigs = [
      ...repeat(5, () => makeSignal({
        article_url: 'https://x.com/cf-dom',
        article_index: 1,
        source_type: 'news',
        signal_type: 'resilience_narrative_positive',
      })),
      makeSignal({
        article_url: 'https://x.com/cf-other',
        article_index: 2,
        source_type: 'news',
        signal_type: 'resilience_narrative_positive',
      }),
    ];
    const scored = scoreComponents(sigs, { totalArticles: 2 });
    assert.equal(scored.narrative.counterfactual_article_key, 'https://x.com/cf-dom');
    assert.notEqual(scored.narrative.counterfactual_delta, null);
  });

  it('returns null when only one article contributes', () => {
    const sigs = repeat(5, () => makeSignal({
      article_url: 'https://x.com/only',
      article_index: 1,
      source_type: 'news',
      signal_type: 'resilience_narrative_positive',
    }));
    const scored = scoreComponents(sigs, { totalArticles: 1 });
    assert.equal(scored.narrative.counterfactual_article_key, null);
    assert.equal(scored.narrative.counterfactual_delta, null);
  });
});

describe('scoreComponents — facets (T4)', () => {
  it('emits facets for components defined in COMPONENT_FACETS', () => {
    const sigs = [
      makeSignal({ signal_type: 'leadership_visible_presence', source_type: 'news' }),
      makeSignal({ signal_type: 'coordination_success', source_type: 'radio',
        article_url: 'https://x.com/cf-2', article_index: 2 }),
    ];
    const scored = scoreComponents(sigs, { totalArticles: 2 });
    assert.ok(scored.leadership.facets, 'leadership should have facets');
    assert.deepEqual(
      Object.keys(scored.leadership.facets).sort(),
      Object.keys(COMPONENT_FACETS.leadership).sort(),
    );
    assert.ok(scored.leadership.facets.visibility.score != null,
      'visibility facet should be scored when visible_presence signal exists');
    assert.ok(scored.leadership.facets.coordination.score != null,
      'coordination facet should be scored when coordination_success signal exists');
  });

  it('returns null facet score when no signals match the facet', () => {
    const sigs = [makeSignal({ signal_type: 'leadership_visible_presence', source_type: 'news' })];
    const scored = scoreComponents(sigs, { totalArticles: 1 });
    assert.equal(scored.leadership.facets.coordination.score, null);
  });

  it('emits facets for every component_id (after Phase-1 N6 expansion)', () => {
    // Drive at least one signal that touches every component, then assert facets are present.
    const sigs = [
      makeSignal({ signal_type: 'leadership_visible_presence', source_type: 'news',
        article_url: 'https://x.com/all-leadership', article_index: 1 }),
      makeSignal({ signal_type: 'information_clarity', source_type: 'news',
        article_url: 'https://x.com/all-info', article_index: 2 }),
      makeSignal({ signal_type: 'compliance_enter_shelter', source_type: 'radio',
        article_url: 'https://x.com/all-life', article_index: 3 }),
      makeSignal({ signal_type: 'service_continuity', source_type: 'news',
        article_url: 'https://x.com/all-cont', article_index: 4 }),
      makeSignal({ signal_type: 'community_volunteering', source_type: 'field',
        article_url: 'https://x.com/all-comm', article_index: 5 }),
      makeSignal({ signal_type: 'solidarity_help_others', source_type: 'field',
        article_url: 'https://x.com/all-belong', article_index: 6 }),
      makeSignal({ signal_type: 'wellbeing_support_accessed', source_type: 'pbo',
        article_url: 'https://x.com/all-well', article_index: 7 }),
      makeSignal({ signal_type: 'resilience_narrative_positive', source_type: 'news',
        article_url: 'https://x.com/all-narr', article_index: 8 }),
    ];
    const scored = scoreComponents(sigs, { totalArticles: 8 });
    for (const compId of Object.keys(COMPONENT_FACETS)) {
      assert.ok(scored[compId].facets,
        `${compId} should have facets after N6 expansion`);
      assert.deepEqual(
        Object.keys(scored[compId].facets).sort(),
        Object.keys(COMPONENT_FACETS[compId]).sort(),
        `${compId} facets should match COMPONENT_FACETS definition`,
      );
    }
  });

  it('every facet signal type maps to its component (directly or via spillover)', async () => {
    // Sanity check: a facet should not reference a signal type that doesn't route to its parent.
    const { SIGNAL_TO_COMPONENTS: mapping } = await import(
      '../../../../../business_modules/resilience/domain/services/behaviorSignals.js');
    for (const [componentId, facets] of Object.entries(COMPONENT_FACETS)) {
      for (const [facetName, signalTypes] of Object.entries(facets)) {
        for (const sigType of signalTypes) {
          assert.ok(
            mapping[sigType] && componentId in mapping[sigType],
            `${componentId}.${facetName} references ${sigType} but it does not route to ${componentId}`,
          );
        }
      }
    }
  });
});

describe('scoreComponents — per-article-source cap (4f extension N5)', () => {
  function narrativeSignal(overrides = {}) {
    return makeSignal({
      signal_type: 'resilience_narrative_positive',
      ...overrides,
    });
  }

  it('caps a single outlet that exceeds 35% even when source_types are diverse', () => {
    // 8 ynet (news) + 1 maariv (news) + 1 kan (radio) — both news outlets share source_type=news,
    // so the source-type cap (50%) does not fire (news is exactly 90% which would fire it actually).
    // The article-source cap should bring ynet down to 35% of polarity mass.
    const heavyOutlet = repeat(8, (i) => narrativeSignal({
      article_url: `https://ynet.co.il/${i}`,
      article_index: i + 1,
      source_type: 'news',
      article_source: 'ynet.co.il',
    }));
    const lightOutletA = [narrativeSignal({
      article_url: 'https://maariv.co.il/a',
      article_index: 100,
      source_type: 'news',
      article_source: 'maariv.co.il',
    })];
    const lightOutletB = [narrativeSignal({
      article_url: 'https://kan.org.il/a',
      article_index: 101,
      source_type: 'radio',
      article_source: 'kan.org.il',
    })];
    const balancedAlternative = [
      ...repeat(3, (i) => narrativeSignal({
        article_url: `https://ynet.co.il/b${i}`,
        article_index: 200 + i,
        source_type: 'news',
        article_source: 'ynet.co.il',
      })),
      ...repeat(3, (i) => narrativeSignal({
        article_url: `https://maariv.co.il/b${i}`,
        article_index: 300 + i,
        source_type: 'news',
        article_source: 'maariv.co.il',
      })),
      ...repeat(3, (i) => narrativeSignal({
        article_url: `https://kan.org.il/b${i}`,
        article_index: 400 + i,
        source_type: 'radio',
        article_source: 'kan.org.il',
      })),
    ];

    const scoredHeavy = scoreComponents([...heavyOutlet, ...lightOutletA, ...lightOutletB], { totalArticles: 10 });
    const scoredBalanced = scoreComponents(balancedAlternative, { totalArticles: 9 });

    // Heavy-outlet positive_evidence should be smaller than balanced because Ynet got capped.
    assert.ok(
      scoredHeavy.narrative.positive_evidence <= scoredBalanced.narrative.positive_evidence + 0.05,
      `heavy-outlet positive ${scoredHeavy.narrative.positive_evidence} should be <= balanced ${scoredBalanced.narrative.positive_evidence}`,
    );
  });

  it('does not cap a single outlet when only one outlet contributes to a polarity', () => {
    const sigs = repeat(5, (i) => narrativeSignal({
      article_url: `https://ynet.co.il/u${i}`,
      article_index: i + 1,
      source_type: 'news',
      article_source: 'ynet.co.il',
    }));
    const scored = scoreComponents(sigs, { totalArticles: 5 });
    assert.ok(scored.narrative.positive_evidence > 0,
      'single-outlet single-source polarity should still produce positive evidence');
  });
});

describe('scoreComponents — N9 explainability annotations', () => {
  it('annotates each emitted signal with _contribution, _weight, _polarity', () => {
    const sigs = [
      makeSignal({
        signal_type: 'resilience_narrative_positive',
        article_url: 'https://x.com/n9/a',
        article_index: 1,
        source_type: 'news',
      }),
      makeSignal({
        signal_type: 'resilience_narrative_negative',
        article_url: 'https://x.com/n9/b',
        article_index: 2,
        source_type: 'radio',
      }),
    ];
    const scored = scoreComponents(sigs, { totalArticles: 2 });
    const narrativeSignals = scored.narrative.signals;
    assert.equal(narrativeSignals.length, 2);
    for (const s of narrativeSignals) {
      assert.ok(typeof s._contribution === 'number',
        '_contribution should be a number');
      assert.ok(s._contribution > 0,
        '_contribution should be the magnitude (always non-negative)');
      assert.ok(typeof s._weight === 'number',
        '_weight should be a number');
      assert.ok(s._polarity === '+' || s._polarity === '-',
        '_polarity should be + or -');
    }
    const positive = narrativeSignals.find((s) => s._polarity === '+');
    const negative = narrativeSignals.find((s) => s._polarity === '-');
    assert.ok(positive && positive._weight > 0, 'positive signal has positive weight');
    assert.ok(negative && negative._weight < 0, 'negative signal has negative weight');
  });

  it('does NOT mutate the original signal objects (no cross-component contamination)', () => {
    // coordination_success routes into 3 components — leadership, community_capital, functional_continuity.
    // The enriched copies should each carry that component's weight; the originals must be pristine.
    const original = makeSignal({
      signal_type: 'coordination_success',
      article_url: 'https://x.com/n9-multi',
      article_index: 1,
      source_type: 'news',
    });
    const sigs = [original];
    scoreComponents(sigs, { totalArticles: 1 });
    assert.equal(original._contribution, undefined,
      'original signal must not be mutated with _contribution');
    assert.equal(original._weight, undefined,
      'original signal must not be mutated with _weight');
    assert.equal(original._polarity, undefined,
      'original signal must not be mutated with _polarity');
  });
});

describe('scoreComponents — extraction_confidence (E4 backend hook)', () => {
  it('lower extraction_confidence reduces evidence mass', () => {
    const high = repeat(6, (i) => makeSignal({
      article_url: `https://x.com/ec/${i}`,
      article_index: i + 1,
      source_type: ['news', 'radio'][i % 2],
      signal_type: 'resilience_narrative_positive',
      extraction_confidence: 1.0,
    }));
    const low = high.map((s) => ({ ...s, extraction_confidence: 0.4 }));
    const scoredHigh = scoreComponents(high, { totalArticles: 6 });
    const scoredLow = scoreComponents(low, { totalArticles: 6 });
    assert.ok(scoredLow.narrative.evidence_mass < scoredHigh.narrative.evidence_mass);
  });
});

describe('scoreComponents — insufficient_data shape', () => {
  it('returns insufficient_data for components with no contributing signals', () => {
    const scored = scoreComponents([], { totalArticles: 0 });
    assert.equal(scored.lifesaving_behavior.score, null);
    assert.equal(scored.lifesaving_behavior.confidence, 'insufficient_data');
    assert.equal(scored.lifesaving_behavior.score_low, null);
    assert.equal(scored.lifesaving_behavior.score_high, null);
  });
});

describe('overallScore', () => {
  it('returns null when no scored components have certainty', () => {
    const scored = scoreComponents([], { totalArticles: 0 });
    assert.equal(overallScore(scored), null);
  });

  it('returns a 1-10 integer when at least one component has evidence', () => {
    const sigs = repeat(8, (i) => makeSignal({
      article_url: `https://x.com/o/${i}`,
      article_index: i + 1,
      source_type: ['news', 'radio'][i % 2],
      signal_type: 'resilience_narrative_positive',
    }));
    const scored = scoreComponents(sigs, { totalArticles: 8 });
    const overall = overallScore(scored);
    assert.ok(Number.isInteger(overall));
    assert.ok(overall >= 1 && overall <= 10);
  });
});

describe('v4 catalog integrity', () => {
  it('SIGNAL_CATALOG and SIGNAL_TO_COMPONENTS are bidirectionally complete', () => {
    const catalogTypes = new Set(SIGNAL_CATALOG.map((s) => s.type));
    const mappingTypes = new Set(Object.keys(SIGNAL_TO_COMPONENTS));
    for (const t of catalogTypes) {
      assert.ok(mappingTypes.has(t), `missing mapping for catalog type ${t}`);
    }
    for (const t of mappingTypes) {
      assert.ok(catalogTypes.has(t), `orphan mapping for ${t}`);
    }
    assert.equal(catalogTypes.size, SIGNAL_TYPES.length);
  });

  it('every catalog entry has signal_class and polarity-coherent mapping', () => {
    for (const entry of SIGNAL_CATALOG) {
      assert.ok(entry.signal_class, `${entry.type} missing signal_class`);
    }
    const warnings = assertCatalogPolarityCoherence();
    assert.deepEqual(warnings, [], warnings.join('; '));
  });

  it('includes all v4 expansion signal types', () => {
    const types = new Set(SIGNAL_TYPES);
    for (const t of [
      'preparedness_drill_conducted',
      'adaptive_practice',
      'recovery_setback',
      'displacement_resolved',
      'civic_engagement_constructive',
      'educational_continuity',
      'child_distress',
      'reservist_family_strain',
      'religious_coping_practice',
      'hostile_influence_operation',
      'protection_effective',
      'media_literacy_demonstrated',
      'complacency_or_normalization',
    ]) {
      assert.ok(types.has(t), `missing v4 type ${t}`);
    }
  });

  it('protection_effective and displacement_resolved route as positive counterparts', () => {
    assert.ok(SIGNAL_TO_COMPONENTS.protection_effective.lifesaving_behavior > 0);
    assert.ok(SIGNAL_TO_COMPONENTS.displacement_resolved.functional_continuity > 0);
    assert.ok(SIGNAL_TO_COMPONENTS.evacuation_displacement.functional_continuity < 0);
  });

  it('topology: compliance_enter_shelter spills to leadership; leadership_clear_guidance to lifesaving', () => {
    assert.ok(SIGNAL_TO_COMPONENTS.compliance_enter_shelter.leadership > 0);
    assert.ok(SIGNAL_TO_COMPONENTS.leadership_clear_guidance.lifesaving_behavior > 0);
  });
});

describe('scoreComponents — v4 intensity', () => {
  it('severe intensity yields higher evidence mass than light for the same signal', () => {
    const light = repeat(4, (i) => makeSignal({
      article_url: `https://x.com/int-l/${i}`,
      article_index: i + 1,
      source_type: 'news',
      signal_type: 'harm_to_population',
      intensity: 'light',
    }));
    const severe = light.map((s, i) => ({
      ...s,
      article_url: `https://x.com/int-s/${i}`,
      intensity: 'severe',
    }));
    const scoredLight = scoreComponents(light, { totalArticles: 4 });
    const scoredSevere = scoreComponents(severe, { totalArticles: 4 });
    assert.ok(scoredSevere.wellbeing_atrisk.evidence_mass > scoredLight.wellbeing_atrisk.evidence_mass);
  });
});

describe('scoreComponents — v4 duplicate-article discount', () => {
  it('ten identical signals from one article contribute less than ten from distinct articles', () => {
    const duplicated = repeat(10, () => makeSignal({
      article_url: 'https://x.com/dup',
      article_index: 1,
      source_type: 'news',
      signal_type: 'solidarity_help_others',
    }));
    const distinct = repeat(10, (i) => makeSignal({
      article_url: `https://x.com/distinct/${i}`,
      article_index: i + 1,
      source_type: 'news',
      signal_type: 'solidarity_help_others',
    }));
    const scoredDup = scoreComponents(duplicated, { totalArticles: 10 });
    const scoredDist = scoreComponents(distinct, { totalArticles: 10 });
    assert.ok(
      scoredDup.belonging_solidarity.positive_evidence <
      scoredDist.belonging_solidarity.positive_evidence,
    );
  });
});

describe('scoreComponents — v4 polarity_override', () => {
  it('social_isolation with polarity_override positive contributes to positive bucket', () => {
    const sigs = [
      makeSignal({
        signal_type: 'social_isolation',
        polarity_override: 'positive',
        scope_level: 'repeated_pattern',
      }),
    ];
    const scored = scoreComponents(sigs, { totalArticles: 1 });
    assert.ok(scored.belonging_solidarity.positive_evidence > 0);
    assert.equal(scored.belonging_solidarity.negative_evidence, 0);
  });
});

describe('scoreComponents — v4 signal_class_mix', () => {
  it('returns class masses for mixed wellbeing evidence', () => {
    const sigs = [
      makeSignal({
        article_url: 'https://x.com/h1',
        article_index: 1,
        signal_type: 'harm_to_population',
        scope_level: 'quantified_or_broad',
      }),
      makeSignal({
        article_url: 'https://x.com/f1',
        article_index: 2,
        source_type: 'radio',
        signal_type: 'fear_expression',
        evidence_type: 'direct_quote_named_person',
      }),
    ];
    const scored = scoreComponents(sigs, { totalArticles: 2 });
    const mix = scored.wellbeing_atrisk.signal_class_mix;
    assert.ok(mix.structural_state > 0);
    assert.ok(mix.attitude > 0);
  });
});

describe('summarizeSubgroupCoverage', () => {
  it('computes pct_subgroup_named among equity-relevant signals', () => {
    const signals = [
      makeSignal({ signal_type: 'inequitable_resource_access', affected_subgroup: 'elderly' }),
      makeSignal({ signal_type: 'inequitable_resource_access' }),
      makeSignal({ signal_type: 'information_clarity' }),
    ];
    const summary = summarizeSubgroupCoverage(signals);
    assert.equal(summary.equity_signal_count, 2);
    assert.equal(summary.subgroup_named_count, 1);
    assert.equal(summary.pct_subgroup_named, 50);
  });
});
