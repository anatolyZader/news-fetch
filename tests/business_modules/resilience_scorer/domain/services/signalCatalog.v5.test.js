import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  CATALOG_VERSION,
  SIGNAL_CATALOG,
  SIGNAL_TYPES,
  SIGNAL_TO_COMPONENTS,
  SIGNAL_ALIASES,
  canonicalizeSignalType,
  validateSignalCatalog,
  assertValidSignalCatalog,
  validateSignalRouting,
  assertValidSignalRouting,
  getRoutingRole,
} from '../../../../../business_modules/resilience_scorer/domain/services/signals/routing/signalRouter.js';
import { COMPONENT_IDS } from '../../../../../business_modules/resilience_scorer/domain/contracts/componentIds.js';

const V6_NEW_TYPES = [
  'self_evacuation_unauthorized',
  'early_warning_system_failure',
  'early_warning_system_effective',
  'population_survey_finding',
  'connectivity_outage',
  'institutional_abandonment_perception',
];

const V5_NEW_TYPES = [
  'compliance_partial',
  'non_compliance_due_to_distrust',
  'compliance_norm_enforcement',
  'near_miss_reported',
  'risk_trade_off_behavior',
  'help_seeking_behavior',
  'bridging_capital_demonstrated',
  'bridging_capital_failure',
  'prosocial_norm_violation',
  'informal_leadership_emergence',
  'blame_shifting',
  'responsibility_avowal',
  'symbolic_vs_substantive_action',
  'delegation_empowerment',
  'information_overload',
  'information_vacuum_post_event',
  'language_register_mismatch',
  'meta_information_present',
  'meta_information_gap',
  'supply_chain_disruption',
  'food_security_stress',
  'food_security_maintained',
  'infrastructure_damage_acute',
  'workplace_flexibility_response',
  'blame_narrative',
  'heroism_overframing',
  'historical_analogy_frame',
  'future_orientation_hope',
  'future_orientation_despair',
  'moral_injury_narrative',
  'volunteer_donor_fatigue',
  'digital_mutual_aid',
  'resource_allocation_transparency',
  'resource_allocation_opacity',
  'sleep_disruption_population',
  'substance_use_uptick',
  'domestic_violence_indicator',
  'suicide_self_harm_indicator',
  'positive_wellbeing_marker',
  'plan_tested_during_event',
  'plan_failed_during_event',
  'responder_workforce_strain',
  'learning_loss_documented',
  'school_psychosocial_support_active',
  'school_psychosocial_support_gap',
  'educational_equity_gap',
  'innovation_under_constraint',
  'failure_to_adapt',
  'cross_event_learning',
  'interpersonal_trust',
  'institutional_trust',
  'media_trust',
  'inter_group_trust',
  'commemoration_event_observed',
  'memorialization_conflict',
  'anniversary_distress_uptick',
  'diaspora_solidarity',
  'international_aid_arrival',
  'international_aid_withdrawal',
  'environmental_damage_acute',
  'agricultural_damage',
  'ecosystem_stress',
  'hostage_family_advocacy',
  'hostage_return_event',
  'hostage_uncertainty_distress',
  'cyber_attack_on_infrastructure',
  'scam_wave_during_emergency',
  'deepfake_misinformation',
];

describe('signalCatalog v6', () => {
  it('has catalog version v8 and ~165 types', () => {
    assert.equal(CATALOG_VERSION, 'v8');
    assert.ok(SIGNAL_TYPES.length >= 165, `expected >=165 types, got ${SIGNAL_TYPES.length}`);
  });

  it('includes all v6 new signal types with routing', () => {
    const types = new Set(SIGNAL_TYPES);
    for (const t of V6_NEW_TYPES) {
      assert.ok(types.has(t), `missing v6 type: ${t}`);
      assert.ok(SIGNAL_TO_COMPONENTS[t], `missing routing for v6 type: ${t}`);
    }
  });

  it('includes all v5 new signal types with routing', () => {
    const types = new Set(SIGNAL_TYPES);
    for (const t of V5_NEW_TYPES) {
      assert.ok(types.has(t), `missing v5 type: ${t}`);
      assert.ok(SIGNAL_TO_COMPONENTS[t], `missing routing for v5 type: ${t}`);
    }
    assert.equal(V5_NEW_TYPES.length, 68);
  });

  it('reclassifies event and capacity signal classes', () => {
    const byType = Object.fromEntries(SIGNAL_CATALOG.map((e) => [e.type, e]));
    assert.equal(byType.harm_to_population.signal_class, 'event');
    assert.equal(byType.protective_infrastructure_present.signal_class, 'capacity');
    assert.equal(byType.hostage_return_event.signal_class, 'event');
  });

  it('mirror targets exist when declared', () => {
    for (const entry of SIGNAL_CATALOG) {
      if (!entry.mirror) continue;
      assert.ok(
        SIGNAL_TYPES.includes(entry.mirror),
        `${entry.type} mirror missing target: ${entry.mirror}`,
      );
    }
  });

  it('validateSignalCatalog (taxonomy) reports no errors or warnings and assert does not throw', () => {
    assert.deepEqual(validateSignalCatalog(), { errors: [], warnings: [] });
    assert.doesNotThrow(() => assertValidSignalCatalog());
  });

  it('validateSignalRouting (scoring policy) reports no errors or warnings and assert does not throw', () => {
    assert.deepEqual(validateSignalRouting(), { errors: [], warnings: [] });
    assert.doesNotThrow(() => assertValidSignalRouting());
  });

  it('has no duplicate signal types', () => {
    const seen = new Set();
    for (const entry of SIGNAL_CATALOG) {
      assert.ok(!seen.has(entry.type), `duplicate type: ${entry.type}`);
      seen.add(entry.type);
    }
  });

  it('every mapping key is a canonical component id', () => {
    const ids = new Set(COMPONENT_IDS);
    for (const [type, mapping] of Object.entries(SIGNAL_TO_COMPONENTS)) {
      for (const componentId of Object.keys(mapping)) {
        assert.ok(ids.has(componentId), `${type}: unknown component ${componentId}`);
      }
    }
  });

  it('aliases are resolvable and never catalog entries or mappings', () => {
    const types = new Set(SIGNAL_TYPES);
    for (const [alias, canonical] of Object.entries(SIGNAL_ALIASES)) {
      assert.ok(!types.has(alias), `alias listed as catalog type: ${alias}`);
      assert.equal(SIGNAL_TO_COMPONENTS[alias], undefined, `alias has mapping: ${alias}`);
      assert.ok(types.has(canonical), `alias target missing: ${canonical}`);
      assert.equal(canonicalizeSignalType(alias), canonical);
    }
    assert.equal(canonicalizeSignalType('leadership_visible_present'), 'leadership_visible_presence');
    assert.equal(canonicalizeSignalType('harm_to_population'), 'harm_to_population');
  });

  it('mirrors are reciprocal opposite-polarity pairs', () => {
    const byType = Object.fromEntries(SIGNAL_CATALOG.map((e) => [e.type, e]));
    for (const entry of SIGNAL_CATALOG) {
      if (!entry.mirror) continue;
      const target = byType[entry.mirror];
      assert.ok(target, `${entry.type}: mirror target missing`);
      assert.equal(target.mirror, entry.type, `${entry.type}: mirror not reciprocal`);
      assert.notEqual(target.defaultPolarity, entry.defaultPolarity, `${entry.type}: mirror same polarity`);
    }
  });

  it('routing fixes: compliance leadership spillover and harm primary-only', () => {
    assert.equal(SIGNAL_TO_COMPONENTS.compliance_follow_instructions.leadership, 0.3);
    assert.equal(SIGNAL_TO_COMPONENTS.non_compliance_ignore_guidelines.leadership, -0.3);
    assert.equal(SIGNAL_TO_COMPONENTS.harm_to_population.wellbeing_at_risk, -1.2);
    assert.equal(SIGNAL_TO_COMPONENTS.harm_to_population.narrative, undefined);
    assert.equal(SIGNAL_TO_COMPONENTS.protection_effective.narrative, 0.3);
    // v7: coping/response signals no longer add positive wellbeing_at_risk mass
    assert.equal(SIGNAL_TO_COMPONENTS.religious_coping_practice.wellbeing_at_risk, undefined);
    assert.equal(SIGNAL_TO_COMPONENTS.help_seeking_behavior.wellbeing_at_risk, undefined);
    assert.equal(SIGNAL_TO_COMPONENTS.hostage_family_advocacy.wellbeing_at_risk, undefined);
    assert.equal(SIGNAL_TO_COMPONENTS.wellbeing_support_accessed.wellbeing_at_risk, undefined);
    assert.equal(SIGNAL_TO_COMPONENTS.wellbeing_support_accessed.community_capital, 0.5);
  });
});

describe('signalCatalog v8', () => {
  it('adds wellbeing_support_gap as reciprocal mirror with routing and priors', () => {
    const gap = SIGNAL_CATALOG.find((s) => s.type === 'wellbeing_support_gap');
    const accessed = SIGNAL_CATALOG.find((s) => s.type === 'wellbeing_support_accessed');
    assert.ok(gap, 'wellbeing_support_gap missing from catalog');
    assert.equal(gap.defaultPolarity, 'negative');
    assert.equal(gap.mirror, 'wellbeing_support_accessed');
    assert.equal(accessed.mirror, 'wellbeing_support_gap');
    assert.equal(SIGNAL_TO_COMPONENTS.wellbeing_support_gap.wellbeing_at_risk, -0.8);
    assert.equal(SIGNAL_TO_COMPONENTS.wellbeing_support_gap.community_capital, -0.3);
  });

  it('restricts resilience_narrative_* to collective self-assessment via disambiguation', () => {
    const neg = SIGNAL_CATALOG.find((s) => s.type === 'resilience_narrative_negative');
    const pos = SIGNAL_CATALOG.find((s) => s.type === 'resilience_narrative_positive');
    assert.ok(neg.disambiguation.not_confused_with.includes('social_isolation'));
    assert.ok(neg.disambiguation.not_confused_with.includes('wellbeing_support_gap'));
    assert.ok(!neg.disambiguation.accept_patterns.some((p) => p.includes('abandoned by the state')),
      'abandonment accept-pattern conflicts with institutional_abandonment_perception');
    assert.ok(pos.disambiguation.not_confused_with.includes('solidarity_help_others'));
  });

  it('epoch 2026-07-15c routing edits', () => {
    // Sub-gate types raised past the 0.5 render gate.
    assert.equal(SIGNAL_TO_COMPONENTS.ecosystem_stress.functional_continuity, -0.5);
    assert.equal(SIGNAL_TO_COMPONENTS.ecosystem_stress.wellbeing_at_risk, undefined);
    assert.equal(SIGNAL_TO_COMPONENTS.equitable_resource_distribution.wellbeing_at_risk, 0.5);
    assert.equal(getRoutingRole('equitable_resource_distribution', 'wellbeing_at_risk'), 'primary');
    assert.equal(SIGNAL_TO_COMPONENTS.historical_analogy_frame.narrative, -0.5);
    // Noise edges dropped.
    assert.equal(SIGNAL_TO_COMPONENTS.adaptive_practice.narrative, undefined);
    assert.equal(SIGNAL_TO_COMPONENTS.innovation_under_constraint.narrative, undefined);
    assert.equal(SIGNAL_TO_COMPONENTS.routine_maintenance.narrative, undefined);
    assert.equal(SIGNAL_TO_COMPONENTS.child_distress.belonging_solidarity, undefined);
    assert.equal(SIGNAL_TO_COMPONENTS.domestic_violence_indicator.belonging_solidarity, undefined);
    assert.equal(SIGNAL_TO_COMPONENTS.interpersonal_trust.information_communication, undefined);
    assert.equal(SIGNAL_TO_COMPONENTS.reservist_family_strain.belonging_solidarity, undefined);
    assert.equal(SIGNAL_TO_COMPONENTS.suicide_self_harm_indicator.narrative, undefined);
    // Alias repoint: negative-named alias no longer folds into a positive type.
    assert.equal(canonicalizeSignalType('non_compliance'), 'non_compliance_ignore_guidelines');
    // New civil-order type with routing and priors.
    assert.ok(SIGNAL_CATALOG.find((s) => s.type === 'public_order_breakdown'));
    assert.equal(SIGNAL_TO_COMPONENTS.public_order_breakdown.community_capital, -0.6);
  });

  it('epoch 2026-07-15c mirror pairs are reciprocal', () => {
    const byType = Object.fromEntries(SIGNAL_CATALOG.map((s) => [s.type, s]));
    const pairs = [
      ['compliance_follow_instructions', 'non_compliance_ignore_guidelines'],
      ['service_continuity', 'service_disruption'],
      ['information_clarity', 'information_confusion'],
      ['inequitable_resource_access', 'equitable_resource_distribution'],
      ['coordination_success', 'coordination_failure'],
    ];
    for (const [a, b] of pairs) {
      assert.equal(byType[a].mirror, b, `${a} should mirror ${b}`);
      assert.equal(byType[b].mirror, a, `${b} should mirror ${a}`);
    }
  });

  it('epoch 2026-07-15b routing edits', () => {
    // Cohesion-decline misuse reaches belonging as a visible inferred edge.
    assert.equal(SIGNAL_TO_COMPONENTS.resilience_narrative_negative.belonging_solidarity, -0.5);
    assert.equal(getRoutingRole('resilience_narrative_negative', 'belonging_solidarity'), 'inferred');
    // Positive twin intentionally NOT mirrored (would flood belonging with mass).
    assert.equal(SIGNAL_TO_COMPONENTS.resilience_narrative_positive.belonging_solidarity, undefined);
    // Helping acts are not narrative-story evidence.
    assert.equal(SIGNAL_TO_COMPONENTS.solidarity_help_others.narrative, undefined);
    // Abandonment perception is a direct leadership-trust observation.
    assert.equal(getRoutingRole('institutional_abandonment_perception', 'leadership'), 'primary');
    assert.equal(SIGNAL_TO_COMPONENTS.institutional_abandonment_perception.leadership, -0.5);
  });
});
