import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  CATALOG_VERSION,
  SIGNAL_CATALOG,
  SIGNAL_TYPES,
  SIGNAL_TO_COMPONENTS,
  DEFAULT_SCORING_PRIORS,
  getScoringPriors,
  assertCatalogPolarityCoherence,
} from '../../../../../business_modules/resilience/domain/services/signalCatalog.js';

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
  it('has catalog version v6 and ~165 types', () => {
    assert.equal(CATALOG_VERSION, 'v6');
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

  it('getScoringPriors merges catalog overrides with defaults', () => {
    const harm = getScoringPriors('harm_to_population');
    assert.equal(harm.intensity_floor, 'moderate');
    assert.ok(harm.expects_quantification);
    const generic = getScoringPriors('information_clarity');
    assert.deepEqual(generic.expected_phases, DEFAULT_SCORING_PRIORS.expected_phases);
  });

  it('assertCatalogPolarityCoherence returns no warnings', () => {
    assert.deepEqual(assertCatalogPolarityCoherence(), []);
  });

  it('routing fixes: compliance leadership spillover and harm spillover', () => {
    assert.equal(SIGNAL_TO_COMPONENTS.compliance_follow_instructions.leadership, 0.3);
    assert.equal(SIGNAL_TO_COMPONENTS.non_compliance_ignore_guidelines.leadership, -0.3);
    assert.equal(SIGNAL_TO_COMPONENTS.harm_to_population.leadership, -0.3);
    assert.equal(SIGNAL_TO_COMPONENTS.harm_to_population.community_capital, -0.4);
    assert.equal(SIGNAL_TO_COMPONENTS.protection_effective.narrative, 0.3);
    assert.equal(SIGNAL_TO_COMPONENTS.religious_coping_practice.wellbeing_at_risk, 0.5);
  });
});
