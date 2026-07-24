/**
 * Closed vocabularies and instance-level enrichment constants for extracted signals (v5 schema).
 *
 * Pipeline position: extract — validation vocabulary; assess — polarity override and equity tagging.
 *
 * Owns: allowed values for signal_class, intensity, phase, affected subgroups/systems; polarity-override whitelist.
 * Does NOT: catalogue routing (routing/signalRouter.js), schema validation runner, or open-vocabulary types.
 *
 * Key collaborators: componentSignalGroups.js, routing/signalRouter.js, ../../contracts/signalCatalog.js, ../../contracts/resilienceContentBatch.js.
 */

/** Allowed signal_class values on extracted signal instances. */
export const SIGNAL_CLASSES = [
  'behavior',
  'attitude',
  'structural_state',
  'narrative',
  'event',
  'capacity',
];

/** Allowed intensity levels on extracted signal instances. */
export const INTENSITY_LEVELS = ['light', 'moderate', 'severe'];

/** Allowed operational phase levels on extracted signal instances. */
export const PHASE_LEVELS = ['anticipation', 'response', 'recovery'];

/** Closed vocabulary for affected population subgroups (equity tagging). */
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

/** Closed vocabulary for affected infrastructure/system domains. */
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
 * - When the override contradicts the entry's defaultPolarity, routing polarity
 *   is flipped for that instance (see signalPolarity in componentSignalGroups.js).
 * - Use for types whose label describes a spectrum (trust, routine, coping)
 *   where the evidence itself decides direction; prefer explicit mirror pairs
 *   when a natural opposite type exists.
 */
export const POLARITY_OVERRIDE_SIGNAL_TYPES = new Set([
  // Compliance quality is a spectrum; default negative (deficiency reading),
  // override positive when the evidence emphasizes compliance mostly succeeded.
  'compliance_partial',
  // Negative as a guidance-system signal; override positive when departure was
  // clearly protective and timely (e.g. pre-order self-evacuation in the north).
  'self_evacuation_unauthorized',
  // Trauma re-activation vs mastery framing — evidence decides direction.
  'historical_analogy_frame',
  // OOV catch-all: novelty is direction-neutral; override positive when the
  // novel pattern is clearly adaptive.
  'novel_behavior_observed',
  // Preparedness vs norm breakdown — override positive for orderly stocking
  // that stayed within official guidance.
  'panic_buying_hoarding',
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

/** Signal types where affected_system tagging is expected for infrastructure metrics. */
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
