/**
 * Closed vocabularies for per-instance signal enrichments (v5 extraction schema).
 */

export const SIGNAL_CLASSES = [
  'behavior',
  'attitude',
  'structural_state',
  'narrative',
  'event',
  'capacity',
];

export const INTENSITY_LEVELS = ['light', 'moderate', 'severe'];

export const PHASE_LEVELS = ['anticipation', 'response', 'recovery'];

export const AFFECTED_SUBGROUPS = [
  'children',
  'elderly',
  'persons_with_disabilities',
  'arab_community',
  'haredi_community',
  'bedouin_community',
  'foreign_workers',
  'reservist_families',
  'low_income',
  'women',
  'hostage_families',
  'evacuee_communities',
  'military_career_families',
  'bereaved_families',
  'new_immigrants',
  'russian_speaking',
  'ethiopian_community',
  'lgbtq',
  'housing_insecure',
  'pregnant_postpartum',
  'chronically_ill',
  'other',
];

export const AFFECTED_SYSTEMS = [
  'power',
  'water',
  'telecom',
  'healthcare',
  'transport',
  'fuel',
  'education',
  'sanitation',
  'food',
  'agriculture',
  'emergency_services',
  'banking_payments',
  'housing',
  'internet',
  'mail_logistics',
  'other',
];

/**
 * Instance-level polarity-override whitelist (scoring policy).
 *
 * Semantics of `polarity_override` (a field on extracted signal INSTANCES, not
 * on catalog entries):
 * - Allowed only for the types listed here; validation strips it elsewhere.
 * - Valid values: 'positive' | 'negative'.
 * - When the override contradicts the entry's defaultPolarity, scoring flips
 *   the sign of the routing weights for that instance (see
 *   effectiveWeightForSignal in ../../epistemic/massContribution.js).
 * - Use for types whose label describes a spectrum (trust, routine, coping)
 *   where the evidence itself decides direction; prefer explicit mirror pairs
 *   when a natural opposite type exists.
 */
export const POLARITY_OVERRIDE_SIGNAL_TYPES = new Set([
  'social_isolation',
  'dependency_on_external_aid',
  'cultural_continuity',
  'routine_maintenance',
  'religious_coping_practice',
  'news_avoidance_behavior',
  'accountability_demand_constructive',
  'local_capacity_demonstrated',
  'interpersonal_trust',
  'institutional_trust',
  'media_trust',
  'inter_group_trust',
  // Survey findings can be positive (high compliance, high confidence);
  // the extractor sets polarity_override from the measured direction.
  'population_survey_finding',
]);

export const AFFECTED_SYSTEM_SIGNAL_TYPES = new Set([
  'service_disruption',
  'service_continuity',
  'system_overload',
  'system_resilience_under_load',
  'rapid_mobilization',
  'delayed_mobilization',
  'recovery_setback',
  'compensation_received',
  'compensation_blocked',
  'supply_chain_disruption',
  'infrastructure_damage_acute',
  'food_security_stress',
  'food_security_maintained',
  'connectivity_outage',
  'cyber_attack_on_infrastructure',
]);

/** Signal types where subgroup tagging is especially expected for equity metrics. */
export const EQUITY_RELEVANT_TYPES = new Set([
  'inequitable_resource_access',
  'equitable_resource_distribution',
  'information_inclusivity_gap',
  'information_inclusivity_present',
  'protective_infrastructure_absent',
  'protective_infrastructure_present',
  'household_readiness_gap',
  'household_readiness_demonstrated',
  'evacuation_displacement',
  'self_evacuation_unauthorized',
  'service_disruption',
  'compensation_blocked',
  'educational_disruption',
  'harm_to_population',
  'reservist_family_strain',
  'parental_burden',
  'educational_equity_gap',
  'food_security_stress',
]);

export const INTENSITY_WEIGHT = {
  light: 0.6,
  moderate: 1,
  severe: 1.4,
};
