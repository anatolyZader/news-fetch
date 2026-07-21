/**
 * Signal → component routing edges, roles, and routing validation.
 *
 * Pipeline position: after the closed catalog. Extraction emits catalog types;
 * this map decides which resilience components each type contributes evidence
 * to. Assess uses these edges when collecting per-component signal groups
 * (componentEvidence / componentSignalGroups).
 *
 * Owns: SIGNAL_TO_COMPONENTS edges (polarity + role), coherence checks against
 * the catalog and COMPONENT_IDS.
 *
 * Does NOT own: the type vocabulary itself (signalCatalog.js). Does not emit
 * numeric scores or weights (min-math uses count-based evidence bands).
 *
 * Edge model: { polarity: '+'|'-', role: 'primary'|'inferred' }.
 * polarity — whether the signal is good or bad news for the component.
 * role — 'primary' is a direct observation of the component; 'inferred' is a
 * weaker secondary association. Only primary edges feed sufficiency/balance
 * bands (componentEvidence.js); inferred edges stay as labeled context and do
 * not appear in contributor/investigation pools.
 *
 * Key collaborators: signalCatalog.js, componentEvidence.js,
 * componentSignalGroups.js, signalRouter.js (facade), assessmentMethodology.js
 * (version bump on edits).
 */
import {
  SIGNAL_CATALOG,
  SIGNAL_ALIASES,
  canonicalizeSignalType,
} from '../../../contracts/signalCatalog.js';
import { COMPONENT_IDS } from '../../../contracts/componentIds.js';

// --- SIGNAL_TO_COMPONENTS map -------------------------------------------------

/**
 * Canonical type → { componentId: { polarity, role } }.
 * Every SIGNAL_CATALOG type must have an entry; aliases must not.
 * Prefer reading via signalRouter.getComponentEdge for canonicalize + lookup.
 * @type {Record<string, Record<string, { polarity: '+'|'-', role: 'primary'|'inferred' }>>}
 */
export const SIGNAL_TO_COMPONENTS = {
  accountability_demand_constructive: {
    leadership: { polarity: '+', role: 'primary' },
    information_communication: { polarity: '+', role: 'inferred' },
  },
  active_information_seeking: {
    information_communication: { polarity: '+', role: 'primary' },
  },
  adaptive_practice: {
    functional_continuity: { polarity: '+', role: 'primary' },
    community_capital: { polarity: '+', role: 'primary' },
  },
  agricultural_damage: {
    functional_continuity: { polarity: '-', role: 'primary' },
    community_capital: { polarity: '-', role: 'inferred' },
  },
  anniversary_distress_uptick: {
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
    narrative: { polarity: '-', role: 'inferred' },
  },
  blame_narrative: {
    narrative: { polarity: '-', role: 'primary' },
    leadership: { polarity: '-', role: 'inferred' },
    belonging_solidarity: { polarity: '-', role: 'inferred' },
  },
  blame_shifting: {
    leadership: { polarity: '-', role: 'primary' },
    narrative: { polarity: '-', role: 'inferred' },
  },
  bridging_capital_demonstrated: {
    belonging_solidarity: { polarity: '+', role: 'primary' },
    community_capital: { polarity: '+', role: 'primary' },
  },
  bridging_capital_failure: {
    belonging_solidarity: { polarity: '-', role: 'primary' },
    community_capital: { polarity: '-', role: 'inferred' },
  },
  calm_confidence: {
    narrative: { polarity: '+', role: 'primary' },
    wellbeing_at_risk: { polarity: '+', role: 'primary' },
  },
  child_distress: {
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
  },
  civic_engagement_constructive: {
    leadership: { polarity: '+', role: 'primary' },
    community_capital: { polarity: '+', role: 'inferred' },
  },
  civil_society_mobilization: {
    leadership: { polarity: '+', role: 'primary' },
    community_capital: { polarity: '+', role: 'primary' },
  },
  commemoration_event_observed: {
    narrative: { polarity: '+', role: 'primary' },
    belonging_solidarity: { polarity: '+', role: 'primary' },
  },
  community_volunteering: {
    community_capital: { polarity: '+', role: 'primary' },
    belonging_solidarity: { polarity: '+', role: 'primary' },
    wellbeing_at_risk: { polarity: '+', role: 'primary' },
  },
  compensation_blocked: {
    functional_continuity: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
    leadership: { polarity: '-', role: 'inferred' },
  },
  compensation_received: {
    functional_continuity: { polarity: '+', role: 'primary' },
    wellbeing_at_risk: { polarity: '+', role: 'inferred' },
  },
  complacency_or_normalization: {
    lifesaving_behavior: { polarity: '-', role: 'primary' },
    information_communication: { polarity: '-', role: 'inferred' },
    narrative: { polarity: '-', role: 'inferred' },
  },
  compliance_enter_shelter: {
    lifesaving_behavior: { polarity: '+', role: 'primary' },
    leadership: { polarity: '+', role: 'inferred' },
    belonging_solidarity: { polarity: '+', role: 'inferred' },
  },
  compliance_follow_instructions: {
    lifesaving_behavior: { polarity: '+', role: 'primary' },
    leadership: { polarity: '+', role: 'inferred' },
  },
  compliance_norm_enforcement: {
    lifesaving_behavior: { polarity: '+', role: 'primary' },
    belonging_solidarity: { polarity: '+', role: 'primary' },
    community_capital: { polarity: '+', role: 'inferred' },
  },
  compliance_partial: {
    lifesaving_behavior: { polarity: '-', role: 'primary' },
    leadership: { polarity: '-', role: 'inferred' },
  },
  conflict_or_tension: {
    belonging_solidarity: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'inferred' },
  },
  conflict_resolution: {
    community_capital: { polarity: '+', role: 'primary' },
    belonging_solidarity: { polarity: '+', role: 'primary' },
    leadership: { polarity: '+', role: 'inferred' },
  },
  consensus_on_priorities: {
    leadership: { polarity: '+', role: 'primary' },
    community_capital: { polarity: '+', role: 'primary' },
    narrative: { polarity: '+', role: 'inferred' },
  },
  coordination_failure: {
    leadership: { polarity: '-', role: 'primary' },
    community_capital: { polarity: '-', role: 'primary' },
    functional_continuity: { polarity: '-', role: 'primary' },
  },
  coordination_success: {
    leadership: { polarity: '+', role: 'primary' },
    community_capital: { polarity: '+', role: 'primary' },
    functional_continuity: { polarity: '+', role: 'inferred' },
  },
  cross_event_learning: {
    functional_continuity: { polarity: '+', role: 'primary' },
    leadership: { polarity: '+', role: 'primary' },
    lifesaving_behavior: { polarity: '+', role: 'inferred' },
  },
  cultural_continuity: {
    narrative: { polarity: '+', role: 'primary' },
    belonging_solidarity: { polarity: '+', role: 'primary' },
    functional_continuity: { polarity: '+', role: 'inferred' },
  },
  cyber_attack_on_infrastructure: {
    information_communication: { polarity: '-', role: 'primary' },
    functional_continuity: { polarity: '-', role: 'primary' },
  },
  deepfake_misinformation: {
    information_communication: { polarity: '-', role: 'primary' },
    narrative: { polarity: '-', role: 'inferred' },
    leadership: { polarity: '-', role: 'inferred' },
  },
  connectivity_outage: {
    functional_continuity: { polarity: '-', role: 'primary' },
    information_communication: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'inferred' },
  },
  early_warning_system_effective: {
    lifesaving_behavior: { polarity: '+', role: 'primary' },
    information_communication: { polarity: '+', role: 'primary' },
    leadership: { polarity: '+', role: 'inferred' },
  },
  early_warning_system_failure: {
    lifesaving_behavior: { polarity: '-', role: 'primary' },
    information_communication: { polarity: '-', role: 'primary' },
    leadership: { polarity: '-', role: 'inferred' },
  },
  institutional_abandonment_perception: {
    narrative: { polarity: '-', role: 'primary' },
    leadership: { polarity: '-', role: 'primary' },
    belonging_solidarity: { polarity: '-', role: 'inferred' },
  },
  population_survey_finding: {
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
    narrative: { polarity: '-', role: 'inferred' },
  },
  self_evacuation_unauthorized: {
    functional_continuity: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'inferred' },
    belonging_solidarity: { polarity: '-', role: 'inferred' },
  },
  delayed_mobilization: {
    functional_continuity: { polarity: '-', role: 'primary' },
    community_capital: { polarity: '-', role: 'primary' },
    leadership: { polarity: '-', role: 'inferred' },
  },
  delegation_empowerment: {
    leadership: { polarity: '+', role: 'primary' },
    community_capital: { polarity: '+', role: 'primary' },
    functional_continuity: { polarity: '+', role: 'inferred' },
  },
  dependency_on_external_aid: {
    community_capital: { polarity: '-', role: 'primary' },
    functional_continuity: { polarity: '-', role: 'inferred' },
  },
  diaspora_solidarity: {
    community_capital: { polarity: '+', role: 'primary' },
    belonging_solidarity: { polarity: '+', role: 'primary' },
    narrative: { polarity: '+', role: 'inferred' },
  },
  digital_mutual_aid: {
    community_capital: { polarity: '+', role: 'primary' },
    belonging_solidarity: { polarity: '+', role: 'primary' },
  },
  displacement_resolved: {
    functional_continuity: { polarity: '+', role: 'primary' },
    wellbeing_at_risk: { polarity: '+', role: 'primary' },
    belonging_solidarity: { polarity: '+', role: 'inferred' },
  },
  dissensus_blocks_action: {
    leadership: { polarity: '-', role: 'primary' },
    community_capital: { polarity: '-', role: 'primary' },
    narrative: { polarity: '-', role: 'inferred' },
  },
  domestic_violence_indicator: {
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
  },
  economic_continuity: {
    functional_continuity: { polarity: '+', role: 'primary' },
    wellbeing_at_risk: { polarity: '+', role: 'inferred' },
  },
  economic_disruption: {
    functional_continuity: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'inferred' },
  },
  // 15c: kept as sole (primary) edge; dropped noise wellbeing edge
  ecosystem_stress: {
    functional_continuity: { polarity: '-', role: 'primary' },
  },
  educational_continuity: {
    functional_continuity: { polarity: '+', role: 'primary' },
    wellbeing_at_risk: { polarity: '+', role: 'inferred' },
  },
  educational_disruption: {
    functional_continuity: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
  },
  educational_equity_gap: {
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
    belonging_solidarity: { polarity: '-', role: 'inferred' },
    functional_continuity: { polarity: '-', role: 'inferred' },
  },
  environmental_damage_acute: {
    functional_continuity: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'inferred' },
  },
  // 15c: wellbeing primary, symmetric with mirror
  equitable_resource_distribution: {
    wellbeing_at_risk: { polarity: '+', role: 'primary' },
    community_capital: { polarity: '+', role: 'inferred' },
    belonging_solidarity: { polarity: '+', role: 'inferred' },
  },
  evacuation_displacement: {
    functional_continuity: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
    belonging_solidarity: { polarity: '-', role: 'inferred' },
  },
  failure_to_adapt: {
    functional_continuity: { polarity: '-', role: 'primary' },
    leadership: { polarity: '-', role: 'inferred' },
    community_capital: { polarity: '-', role: 'inferred' },
  },
  fear_expression: {
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
    narrative: { polarity: '-', role: 'inferred' },
  },
  feedback_channel_blocked: {
    information_communication: { polarity: '-', role: 'primary' },
    leadership: { polarity: '-', role: 'inferred' },
    community_capital: { polarity: '-', role: 'inferred' },
  },
  feedback_channel_open: {
    information_communication: { polarity: '+', role: 'primary' },
    leadership: { polarity: '+', role: 'inferred' },
    community_capital: { polarity: '+', role: 'inferred' },
  },
  feedback_loop_closure: {
    leadership: { polarity: '+', role: 'primary' },
    information_communication: { polarity: '+', role: 'primary' },
  },
  food_security_maintained: {
    functional_continuity: { polarity: '+', role: 'primary' },
    wellbeing_at_risk: { polarity: '+', role: 'inferred' },
  },
  food_security_stress: {
    functional_continuity: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
  },
  future_orientation_despair: {
    narrative: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
  },
  future_orientation_hope: {
    narrative: { polarity: '+', role: 'primary' },
    wellbeing_at_risk: { polarity: '+', role: 'inferred' },
  },
  harm_to_population: {
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
  },
  help_seeking_behavior: {
    belonging_solidarity: { polarity: '+', role: 'primary' },
    community_capital: { polarity: '+', role: 'inferred' },
  },
  heroism_overframing: {
    narrative: { polarity: '-', role: 'primary' },
    leadership: { polarity: '-', role: 'inferred' },
  },
  // 15c: narrative edge promoted to primary
  historical_analogy_frame: {
    narrative: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'inferred' },
  },
  hostage_family_advocacy: {
    narrative: { polarity: '+', role: 'primary' },
    leadership: { polarity: '+', role: 'inferred' },
    belonging_solidarity: { polarity: '+', role: 'primary' },
  },
  hostage_return_event: {
    narrative: { polarity: '+', role: 'primary' },
    wellbeing_at_risk: { polarity: '+', role: 'primary' },
    belonging_solidarity: { polarity: '+', role: 'inferred' },
  },
  hostage_uncertainty_distress: {
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
    narrative: { polarity: '-', role: 'primary' },
  },
  hostile_influence_operation: {
    information_communication: { polarity: '-', role: 'primary' },
    narrative: { polarity: '-', role: 'inferred' },
    leadership: { polarity: '-', role: 'inferred' },
  },
  household_readiness_demonstrated: {
    lifesaving_behavior: { polarity: '+', role: 'primary' },
    community_capital: { polarity: '+', role: 'inferred' },
  },
  household_readiness_gap: {
    lifesaving_behavior: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'inferred' },
  },
  household_strain_economic: {
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
    functional_continuity: { polarity: '-', role: 'inferred' },
  },
  inequitable_resource_access: {
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
    community_capital: { polarity: '-', role: 'primary' },
    belonging_solidarity: { polarity: '-', role: 'inferred' },
  },
  informal_leadership_emergence: {
    leadership: { polarity: '+', role: 'primary' },
    community_capital: { polarity: '+', role: 'primary' },
  },
  information_actionable_effective: {
    information_communication: { polarity: '+', role: 'primary' },
    lifesaving_behavior: { polarity: '+', role: 'primary' },
  },
  information_clarity: {
    information_communication: { polarity: '+', role: 'primary' },
    lifesaving_behavior: { polarity: '+', role: 'inferred' },
  },
  information_confusion: {
    information_communication: { polarity: '-', role: 'primary' },
    leadership: { polarity: '-', role: 'inferred' },
    lifesaving_behavior: { polarity: '-', role: 'inferred' },
  },
  information_effectiveness_gap: {
    information_communication: { polarity: '-', role: 'primary' },
    lifesaving_behavior: { polarity: '-', role: 'primary' },
  },
  information_inclusivity_gap: {
    information_communication: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
    belonging_solidarity: { polarity: '-', role: 'inferred' },
  },
  information_inclusivity_present: {
    information_communication: { polarity: '+', role: 'primary' },
    wellbeing_at_risk: { polarity: '+', role: 'primary' },
  },
  information_overload: {
    information_communication: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'inferred' },
  },
  information_vacuum_post_event: {
    information_communication: { polarity: '-', role: 'primary' },
    leadership: { polarity: '-', role: 'inferred' },
  },
  infrastructure_damage_acute: {
    functional_continuity: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'inferred' },
  },
  innovation_under_constraint: {
    functional_continuity: { polarity: '+', role: 'primary' },
    community_capital: { polarity: '+', role: 'primary' },
  },
  institutional_trust: {
    leadership: { polarity: '+', role: 'primary' },
    information_communication: { polarity: '+', role: 'inferred' },
  },
  inter_group_trust: {
    belonging_solidarity: { polarity: '+', role: 'primary' },
    community_capital: { polarity: '+', role: 'inferred' },
    leadership: { polarity: '+', role: 'inferred' },
  },
  interfaith_solidarity: {
    belonging_solidarity: { polarity: '+', role: 'primary' },
    community_capital: { polarity: '+', role: 'inferred' },
  },
  interfaith_tension: {
    belonging_solidarity: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'inferred' },
    community_capital: { polarity: '-', role: 'inferred' },
  },
  international_aid_arrival: {
    community_capital: { polarity: '+', role: 'primary' },
    functional_continuity: { polarity: '+', role: 'primary' },
  },
  international_aid_withdrawal: {
    community_capital: { polarity: '-', role: 'primary' },
    functional_continuity: { polarity: '-', role: 'inferred' },
  },
  interpersonal_trust: {
    belonging_solidarity: { polarity: '+', role: 'primary' },
    leadership: { polarity: '+', role: 'inferred' },
  },
  language_register_mismatch: {
    information_communication: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'inferred' },
    belonging_solidarity: { polarity: '-', role: 'inferred' },
  },
  leadership_absence: {
    leadership: { polarity: '-', role: 'primary' },
    lifesaving_behavior: { polarity: '-', role: 'inferred' },
  },
  leadership_clear_guidance: {
    leadership: { polarity: '+', role: 'primary' },
    lifesaving_behavior: { polarity: '+', role: 'inferred' },
  },
  leadership_credibility_loss: {
    leadership: { polarity: '-', role: 'primary' },
    narrative: { polarity: '-', role: 'inferred' },
  },
  leadership_visible_presence: {
    leadership: { polarity: '+', role: 'primary' },
  },
  learning_loss_documented: {
    functional_continuity: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
  },
  lessons_learned_uptake: {
    functional_continuity: { polarity: '+', role: 'primary' },
    leadership: { polarity: '+', role: 'primary' },
    lifesaving_behavior: { polarity: '+', role: 'inferred' },
  },
  local_capacity_demonstrated: {
    community_capital: { polarity: '+', role: 'primary' },
    functional_continuity: { polarity: '+', role: 'inferred' },
  },
  media_literacy_demonstrated: {
    information_communication: { polarity: '+', role: 'primary' },
    community_capital: { polarity: '+', role: 'primary' },
  },
  media_trust: {
    information_communication: { polarity: '+', role: 'primary' },
    narrative: { polarity: '+', role: 'inferred' },
    leadership: { polarity: '+', role: 'inferred' },
  },
  memorialization_conflict: {
    belonging_solidarity: { polarity: '-', role: 'primary' },
    narrative: { polarity: '-', role: 'inferred' },
  },
  meta_information_gap: {
    information_communication: { polarity: '-', role: 'primary' },
    leadership: { polarity: '-', role: 'inferred' },
  },
  meta_information_present: {
    information_communication: { polarity: '+', role: 'primary' },
    leadership: { polarity: '+', role: 'inferred' },
  },
  mistrusted_information_source: {
    information_communication: { polarity: '-', role: 'primary' },
    leadership: { polarity: '-', role: 'inferred' },
    narrative: { polarity: '-', role: 'inferred' },
  },
  misinformation_acted_upon: {
    information_communication: { polarity: '-', role: 'primary' },
    lifesaving_behavior: { polarity: '-', role: 'inferred' },
  },
  moral_injury_narrative: {
    narrative: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
  },
  near_miss_reported: {
    lifesaving_behavior: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
  },
  // Weak catch-all by design; wellbeing kept primary (historical max edge)
  // so the type still reaches one evidence pool.
  novel_behavior_observed: {
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
    community_capital: { polarity: '-', role: 'inferred' },
    information_communication: { polarity: '-', role: 'inferred' },
  },
  news_avoidance_behavior: {
    information_communication: { polarity: '-', role: 'primary' },
    lifesaving_behavior: { polarity: '-', role: 'inferred' },
  },
  non_compliance_due_to_distrust: {
    lifesaving_behavior: { polarity: '-', role: 'primary' },
    information_communication: { polarity: '-', role: 'primary' },
    leadership: { polarity: '-', role: 'inferred' },
  },
  non_compliance_exit_early: {
    lifesaving_behavior: { polarity: '-', role: 'primary' },
  },
  non_compliance_ignore_guidelines: {
    lifesaving_behavior: { polarity: '-', role: 'primary' },
    leadership: { polarity: '-', role: 'inferred' },
  },
  panic_behavior: {
    lifesaving_behavior: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
  },
  panic_buying_hoarding: {
    functional_continuity: { polarity: '-', role: 'primary' },
    community_capital: { polarity: '-', role: 'inferred' },
  },
  parental_burden: {
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
    functional_continuity: { polarity: '-', role: 'inferred' },
  },
  plan_failed_during_event: {
    lifesaving_behavior: { polarity: '-', role: 'primary' },
    leadership: { polarity: '-', role: 'primary' },
  },
  plan_tested_during_event: {
    lifesaving_behavior: { polarity: '+', role: 'primary' },
    leadership: { polarity: '+', role: 'inferred' },
  },
  political_distrust: {
    leadership: { polarity: '-', role: 'primary' },
    narrative: { polarity: '-', role: 'inferred' },
    information_communication: { polarity: '-', role: 'inferred' },
  },
  positive_wellbeing_marker: {
    wellbeing_at_risk: { polarity: '+', role: 'primary' },
    narrative: { polarity: '+', role: 'inferred' },
  },
  post_event_recovery_indicator: {
    functional_continuity: { polarity: '+', role: 'primary' },
    community_capital: { polarity: '+', role: 'inferred' },
    narrative: { polarity: '+', role: 'inferred' },
  },
  preparedness_drill_conducted: {
    lifesaving_behavior: { polarity: '+', role: 'primary' },
    leadership: { polarity: '+', role: 'primary' },
    community_capital: { polarity: '+', role: 'inferred' },
  },
  preparedness_gap_identified: {
    lifesaving_behavior: { polarity: '-', role: 'primary' },
    leadership: { polarity: '-', role: 'primary' },
  },
  prosocial_norm_violation: {
    belonging_solidarity: { polarity: '-', role: 'primary' },
    community_capital: { polarity: '-', role: 'primary' },
  },
  protection_effective: {
    lifesaving_behavior: { polarity: '+', role: 'primary' },
    narrative: { polarity: '+', role: 'inferred' },
    leadership: { polarity: '+', role: 'inferred' },
  },
  protective_infrastructure_absent: {
    lifesaving_behavior: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
  },
  protective_infrastructure_present: {
    lifesaving_behavior: { polarity: '+', role: 'primary' },
    functional_continuity: { polarity: '+', role: 'primary' },
  },
  psychological_distress: {
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
  },
  rapid_mobilization: {
    functional_continuity: { polarity: '+', role: 'primary' },
    community_capital: { polarity: '+', role: 'primary' },
    leadership: { polarity: '+', role: 'inferred' },
  },
  recovery_setback: {
    functional_continuity: { polarity: '-', role: 'primary' },
    narrative: { polarity: '-', role: 'inferred' },
    community_capital: { polarity: '-', role: 'inferred' },
  },
  religious_coping_practice: {
    belonging_solidarity: { polarity: '+', role: 'primary' },
    narrative: { polarity: '+', role: 'primary' },
  },
  relocation_intention_expressed: {
    belonging_solidarity: { polarity: '-', role: 'primary' },
    functional_continuity: { polarity: '-', role: 'inferred' },
  },
  reservist_family_strain: {
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
    community_capital: { polarity: '-', role: 'inferred' },
  },
  // Epoch 2026-07-15b: secondary belonging edge — historically misused for
  // cohesion-decline observations, which must reach the belonging pool too.
  resilience_narrative_negative: {
    narrative: { polarity: '-', role: 'primary' },
    belonging_solidarity: { polarity: '-', role: 'primary' },
  },
  resilience_narrative_positive: {
    narrative: { polarity: '+', role: 'primary' },
  },
  resource_allocation_opacity: {
    community_capital: { polarity: '-', role: 'primary' },
    leadership: { polarity: '-', role: 'inferred' },
    wellbeing_at_risk: { polarity: '-', role: 'inferred' },
  },
  resource_allocation_transparency: {
    community_capital: { polarity: '+', role: 'primary' },
    leadership: { polarity: '+', role: 'inferred' },
    wellbeing_at_risk: { polarity: '+', role: 'inferred' },
  },
  resource_mobilization: {
    community_capital: { polarity: '+', role: 'primary' },
    wellbeing_at_risk: { polarity: '+', role: 'primary' },
  },
  public_order_breakdown: {
    community_capital: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'inferred' },
  },
  resource_shortage: {
    community_capital: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
    functional_continuity: { polarity: '-', role: 'primary' },
  },
  responder_workforce_strain: {
    lifesaving_behavior: { polarity: '-', role: 'primary' },
    leadership: { polarity: '-', role: 'primary' },
    functional_continuity: { polarity: '-', role: 'inferred' },
  },
  responsibility_avowal: {
    leadership: { polarity: '+', role: 'primary' },
    narrative: { polarity: '+', role: 'inferred' },
  },
  return_intention_expressed: {
    belonging_solidarity: { polarity: '+', role: 'primary' },
    functional_continuity: { polarity: '+', role: 'inferred' },
  },
  risk_exposure_behavior: {
    lifesaving_behavior: { polarity: '-', role: 'primary' },
  },
  risk_trade_off_behavior: {
    lifesaving_behavior: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'inferred' },
  },
  routine_disruption: {
    functional_continuity: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'inferred' },
  },
  routine_maintenance: {
    functional_continuity: { polarity: '+', role: 'primary' },
  },
  rumor_correction: {
    information_communication: { polarity: '+', role: 'primary' },
    narrative: { polarity: '+', role: 'inferred' },
  },
  rumor_spread: {
    information_communication: { polarity: '-', role: 'primary' },
    narrative: { polarity: '-', role: 'primary' },
  },
  scam_wave_during_emergency: {
    information_communication: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
  },
  school_psychosocial_support_active: {
    wellbeing_at_risk: { polarity: '+', role: 'primary' },
    functional_continuity: { polarity: '+', role: 'inferred' },
  },
  school_psychosocial_support_gap: {
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
    functional_continuity: { polarity: '-', role: 'inferred' },
  },
  self_organization: {
    community_capital: { polarity: '+', role: 'primary' },
    belonging_solidarity: { polarity: '+', role: 'primary' },
  },
  service_continuity: {
    functional_continuity: { polarity: '+', role: 'primary' },
  },
  service_disruption: {
    functional_continuity: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'inferred' },
  },
  sleep_disruption_population: {
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
  },
  social_isolation: {
    belonging_solidarity: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
  },
  // Epoch 2026-07-15b: dropped narrative edge — helping acts are not
  // narrative-story evidence and only inflated narrative signal counts.
  solidarity_help_others: {
    belonging_solidarity: { polarity: '+', role: 'primary' },
    wellbeing_at_risk: { polarity: '+', role: 'primary' },
    community_capital: { polarity: '+', role: 'primary' },
  },
  substance_use_uptick: {
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
  },
  suicide_self_harm_indicator: {
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
  },
  supply_chain_disruption: {
    functional_continuity: { polarity: '-', role: 'primary' },
    community_capital: { polarity: '-', role: 'inferred' },
  },
  symbolic_vs_substantive_action: {
    leadership: { polarity: '-', role: 'primary' },
    narrative: { polarity: '-', role: 'inferred' },
  },
  system_overload: {
    functional_continuity: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
  },
  system_resilience_under_load: {
    functional_continuity: { polarity: '+', role: 'primary' },
    wellbeing_at_risk: { polarity: '+', role: 'inferred' },
  },
  trusted_information_source: {
    information_communication: { polarity: '+', role: 'primary' },
    leadership: { polarity: '+', role: 'inferred' },
    narrative: { polarity: '+', role: 'inferred' },
  },
  unsafe_gathering: {
    lifesaving_behavior: { polarity: '-', role: 'primary' },
  },
  volunteer_donor_fatigue: {
    community_capital: { polarity: '-', role: 'primary' },
  },
  wellbeing_support_accessed: {
    community_capital: { polarity: '+', role: 'primary' },
    functional_continuity: { polarity: '+', role: 'inferred' },
  },
  wellbeing_support_gap: {
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
    community_capital: { polarity: '-', role: 'inferred' },
  },
  workplace_flexibility_response: {
    functional_continuity: { polarity: '+', role: 'primary' },
    wellbeing_at_risk: { polarity: '+', role: 'primary' },
  },
};

// --- Role lookup -------------------------------------------------------------

/**
 * Look up whether an edge is a direct observation or a secondary association.
 * Canonicalizes the signal type; missing edges default to 'primary'.
 * @param {string} signalType
 * @param {string} componentId
 * @returns {'primary'|'inferred'}
 */
export function getRoutingRole(signalType, componentId) {
  return SIGNAL_TO_COMPONENTS[canonicalizeSignalType(signalType)]?.[componentId]?.role ?? 'primary';
}

const CATALOG_BY_TYPE = Object.fromEntries(SIGNAL_CATALOG.map((s) => [s.type, s]));

// --- Coherence validation (catalog ↔ routing) --------------------------------

/** Warn when catalog defaultPolarity has no matching-polarity edge in the mapping. */
function checkCatalogEntryPolarity(entry, mapping, warnings) {
  const hasPositive = Object.values(mapping).some((e) => e?.polarity === '+');
  const hasNegative = Object.values(mapping).some((e) => e?.polarity === '-');
  if (entry.defaultPolarity === 'positive' && !hasPositive) {
    warnings.push(`${entry.type}: defaultPolarity positive but no positive edge`);
  }
  if (entry.defaultPolarity === 'negative' && !hasNegative) {
    warnings.push(`${entry.type}: defaultPolarity negative but no negative edge`);
  }
}

/** Error on unknown component ids, malformed edges, or a type with no primary edge. */
function checkMappingEdges(type, mapping, componentIds, errors) {
  let hasPrimary = false;
  for (const [componentId, edge] of Object.entries(mapping)) {
    if (!componentIds.has(componentId)) {
      errors.push(`${type}: unknown component id in mapping: ${componentId}`);
    }
    if (edge?.polarity !== '+' && edge?.polarity !== '-') {
      errors.push(`${type}: invalid polarity for ${componentId}: ${edge?.polarity}`);
    }
    if (edge?.role !== 'primary' && edge?.role !== 'inferred') {
      errors.push(`${type}: invalid role for ${componentId}: ${edge?.role}`);
    } else if (edge.role === 'primary') {
      hasPrimary = true;
    }
  }
  if (!hasPrimary) errors.push(`${type}: no primary edge`);
}

/** Response/capacity indicators must not positively route into wellbeing_at_risk. */
function checkIndicatorKind(entry, mapping, errors) {
  const kind = entry.indicator_kind;
  if (kind !== 'response' && kind !== 'capacity') return;
  const edge = mapping?.wellbeing_at_risk;
  if (edge != null && edge.polarity === '+') {
    errors.push(`${entry.type}: indicator_kind '${kind}' must not route positively into wellbeing_at_risk (treatment uptake is not evidence of wellbeing)`);
  }
}

/**
 * Routing ↔ catalog coherence check (policy side).
 * Errors are contract violations (CI must fail); warnings are advisory.
 * Ensures every catalog type is mapped, no orphan mappings, no alias keys,
 * well-formed polarity/role edges, ≥1 primary edge per type, and
 * indicator_kind rules.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateSignalRouting() {
  const errors = [];
  const warnings = [];
  const componentIds = new Set(COMPONENT_IDS);
  for (const alias of Object.keys(SIGNAL_ALIASES)) {
    if (SIGNAL_TO_COMPONENTS[alias]) errors.push(`alias must not have a component mapping: ${alias}`);
  }
  for (const entry of SIGNAL_CATALOG) {
    const mapping = SIGNAL_TO_COMPONENTS[entry.type];
    if (!mapping) {
      errors.push(`missing mapping for ${entry.type}`);
      continue;
    }
    checkCatalogEntryPolarity(entry, mapping, warnings);
    checkMappingEdges(entry.type, mapping, componentIds, errors);
    checkIndicatorKind(entry, mapping, errors);
  }
  for (const type of Object.keys(SIGNAL_TO_COMPONENTS)) {
    if (!CATALOG_BY_TYPE[type]) errors.push(`orphan mapping for ${type}`);
  }
  return { errors, warnings };
}

/**
 * Throws if routing violates its contract with the catalog.
 * Prefer for tests/startup; use validateSignalRouting when collecting warnings.
 * @throws {Error}
 */
export function assertValidSignalRouting() {
  const { errors } = validateSignalRouting();
  if (errors.length > 0) {
    throw new Error(`Invalid signal routing:\n${errors.join('\n')}`);
  }
}
