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
  // v10: symmetrized with bridging_capital_demonstrated — failed cross-group
  // links when needed are direct capital-deficit evidence, not mere influence.
  bridging_capital_failure: {
    belonging_solidarity: { polarity: '-', role: 'primary' },
    community_capital: { polarity: '-', role: 'primary' },
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
  // v10: '+' wellbeing edge removed (construct_role 'response' — volunteering
  // demonstrates capital/solidarity; it does not establish population wellbeing).
  community_volunteering: {
    community_capital: { polarity: '+', role: 'primary' },
    belonging_solidarity: { polarity: '+', role: 'primary' },
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
  // v10 multi-primary review: coordination failure directly DESCRIBES governance
  // (leadership) and organizational capital; its continuity impact is downstream
  // influence → demoted to inferred.
  coordination_failure: {
    leadership: { polarity: '-', role: 'primary' },
    community_capital: { polarity: '-', role: 'primary' },
    functional_continuity: { polarity: '-', role: 'inferred' },
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
  // Non-scoring fallback (NON_SCORING_FALLBACK_TYPES): novelty is an epistemic
  // state, not a resilience direction. All edges inferred — visible as labeled
  // context but never feeds sufficiency/balance bands.
  novel_behavior_observed: {
    wellbeing_at_risk: { polarity: '-', role: 'inferred' },
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
  // v9: closes belonging_solidarity GQ3 ("groups perceived as outside the camp,
  // scapegoated or blamed"), which had no instrument at all — zero signals across
  // a 284-signal report in a demographically mixed region. Belonging is the direct
  // construct; the narrative effect is secondary. Deliberately no wellbeing edge:
  // othering harms belonging directly, while harm to the othered group's wellbeing
  // is a separate claim needing its own evidence.
  out_group_blaming: {
    belonging_solidarity: { polarity: '-', role: 'primary' },
    narrative: { polarity: '-', role: 'inferred' },
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
  // v10: '+' wellbeing edge removed (response — mobilized resources are capital
  // evidence; their wellbeing effect needs outcome evidence).
  resource_mobilization: {
    community_capital: { polarity: '+', role: 'primary' },
  },
  public_order_breakdown: {
    community_capital: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'inferred' },
  },
  // v10 multi-primary review: shortage directly DESCRIBES a capital deficit and
  // unmet material needs (wellbeing = capacity to address needs); its service-
  // continuity impact is downstream influence → demoted to inferred.
  resource_shortage: {
    community_capital: { polarity: '-', role: 'primary' },
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
    functional_continuity: { polarity: '-', role: 'inferred' },
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
  // v10: primary re-anchored to community_capital (support activity is service
  // mobilization, not proof of child wellbeing) — same convention as
  // wellbeing_support_accessed in v7. The gap mirror keeps wellbeing primary:
  // missing support is direct wellbeing-at-risk evidence.
  school_psychosocial_support_active: {
    community_capital: { polarity: '+', role: 'primary' },
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
  // v10: '+' wellbeing edge removed (response — helping behavior is solidarity
  // evidence; recipients' improved wellbeing needs outcome evidence).
  solidarity_help_others: {
    belonging_solidarity: { polarity: '+', role: 'primary' },
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
  // v9: construct_role 'institutional_state', so the '+' wellbeing_at_risk edge is
  // legal under checkConstructRole — and constitutive rather than proxy evidence.
  // The v7 rule bars response/capacity types because "treatment uptake is not
  // evidence of wellbeing"; but this component's own definition is "the ability to
  // identify and address the needs of vulnerable populations", and its GQ1/GQ3 are
  // literally "activity to IDENTIFY needs" and "mechanisms to LOCATE, MAP and
  // MONITOR at-risk individuals". A standing registry is that mechanism. The rule
  // still binds for wellbeing_support_provided below, which stays off this edge.
  vulnerable_population_mapping: {
    wellbeing_at_risk: { polarity: '+', role: 'primary' },
    community_capital: { polarity: '+', role: 'inferred' },
  },
  wellbeing_support_accessed: {
    community_capital: { polarity: '+', role: 'primary' },
    functional_continuity: { polarity: '+', role: 'inferred' },
  },
  // v9: split off wellbeing_support_accessed, which had stretched to cover "the
  // welfare department is operating". Routes identically to the type it split
  // from, so community_capital loses nothing. No wellbeing_at_risk edge: service
  // provision is a response, and the v7 rule holds.
  wellbeing_support_provided: {
    community_capital: { polarity: '+', role: 'primary' },
    functional_continuity: { polarity: '+', role: 'inferred' },
  },
  wellbeing_support_gap: {
    wellbeing_at_risk: { polarity: '-', role: 'primary' },
    community_capital: { polarity: '-', role: 'inferred' },
  },
  // v10: '+' wellbeing edge removed (response — flexibility supports continuity;
  // preserved household wellbeing needs outcome evidence).
  workplace_flexibility_response: {
    functional_continuity: { polarity: '+', role: 'primary' },
  },
};

/**
 * Catch-all/fallback types: visible as labeled inferred context, never allowed
 * a primary edge (enforced bidirectionally by checkMappingEdges), so they can
 * never move a component's sufficiency/balance bands.
 */
export const NON_SCORING_FALLBACK_TYPES = new Set(['novel_behavior_observed']);

/**
 * Documented mirror-routing asymmetries (v10). A mirror pair is symmetric when
 * both types route to the same components with the same roles and inverted
 * polarity. Every deviation must be listed here with a real reason, or the
 * routing validator errors — hidden negativity/positivity bias is not allowed
 * to pass silently. Keys are the two type ids sorted and joined with '|'.
 *
 * Recurring rationales:
 * - disruption/gap/stress is DIRECT wellbeing-at-risk evidence, while routine
 *   operation or availability alone does not establish population wellbeing
 *   (construct_role response/capacity rule);
 * - failure carries stronger evidentiary meaning about institutions than the
 *   absence of failure;
 * - a response demonstrates activated capital; the mirrored adverse state is a
 *   population condition, not a capital observation.
 * @type {Record<string, string>}
 */
export const MIRROR_ROUTING_ASYMMETRY = {
  'compliance_enter_shelter|non_compliance_exit_early':
    'Compliance implies trust in guidance (inferred leadership/belonging spillover); early exit signals impatience or pressure, not necessarily distrust.',
  'social_isolation|solidarity_help_others':
    'Helping is activated capital (+ community_capital); isolation is a population state that directly harms wellbeing but observes no capital.',
  'conflict_or_tension|conflict_resolution':
    'Resolution is a response demonstrating capital and leadership skill; tension is a population state directly risking wellbeing.',
  'interfaith_solidarity|interfaith_tension':
    'Inter-group tension carries an inferred wellbeing risk; solidarity alone does not establish wellbeing (response rule).',
  'leadership_absence|leadership_visible_presence':
    'Absence removes the guidance channel (inferred lifesaving risk); visible presence alone does not establish protective-behavior uptake.',
  'information_clarity|information_confusion':
    'Confusion reflects on authorities (inferred leadership); clarity is the expected baseline and carries no leadership credit.',
  'rumor_correction|rumor_spread':
    'Rumors directly shape the collective narrative; correction is an information practice whose narrative effect is inferred.',
  'information_inclusivity_gap|information_inclusivity_present':
    'An inclusivity gap excludes specific groups (inferred belonging harm); inclusive information alone does not demonstrate belonging.',
  'service_continuity|service_disruption':
    'Disruption has direct wellbeing consequences (inferred here, primary via continuity); routine operation is insufficient to establish wellbeing.',
  'routine_disruption|routine_maintenance':
    'Broken daily routines carry an inferred wellbeing risk; maintained routines alone do not establish wellbeing.',
  'system_overload|system_resilience_under_load':
    'Overload directly evidences unmet population need; a system holding under load is not direct wellbeing evidence.',
  'compensation_blocked|compensation_received':
    'Blocked compensation is direct unmet material need and reflects on institutions; received compensation supports wellbeing only indirectly.',
  'food_security_maintained|food_security_stress':
    'Food stress is direct wellbeing-at-risk evidence; maintained food security is the expected baseline (inferred support).',
  'calm_confidence|fear_expression':
    'Calm confidence is a collective-tone claim (primary narrative); fear is population distress first, narrative influence second.',
  'future_orientation_despair|future_orientation_hope':
    'Despair is direct wellbeing-risk evidence; expressed hope alone does not establish wellbeing.',
  'resource_mobilization|resource_shortage':
    'Shortage directly evidences unmet needs and strained continuity; mobilization is a response whose wellbeing effect needs outcome evidence (v10 rule).',
  'wellbeing_support_accessed|wellbeing_support_gap':
    'A support gap is direct wellbeing-at-risk evidence; support uptake is a response anchored on community_capital (v7 rule).',
  'equitable_resource_distribution|inequitable_resource_access':
    'Inequity directly evidences a distribution failure of capital; equitable distribution is weaker positive evidence of the same.',
  'protective_infrastructure_absent|protective_infrastructure_present':
    'Missing protection is direct exposure risk (wellbeing); present protection directly enables functioning (continuity) — different direct consequences.',
  'household_readiness_demonstrated|household_readiness_gap':
    'Readiness spillover differs by direction: preparedness reflects capital; a readiness gap implies exposure risk.',
  'plan_failed_during_event|plan_tested_during_event':
    'Plan failure reflects directly on leadership; a plan working credits leadership only indirectly.',
  'adaptive_practice|failure_to_adapt':
    'Successful adaptation demonstrates capital; failure to adapt reflects on leadership (inferred) rather than demonstrating capital absence.',
  'educational_continuity|educational_disruption':
    'School disruption directly harms child wellbeing; school continuity supports wellbeing only indirectly.',
  'school_psychosocial_support_active|school_psychosocial_support_gap':
    'Active support is service mobilization (community_capital, v10); a support gap is direct wellbeing-at-risk evidence.',
  'international_aid_arrival|international_aid_withdrawal':
    'Arriving aid directly enables continuity; withdrawal harms capital directly while its continuity impact is inferred.',
};

// --- Role lookup -------------------------------------------------------------

/**
 * Look up whether an edge is a direct observation or a secondary association.
 * Canonicalizes the signal type; fail-closed: a missing edge or unknown type
 * returns null (never a silent 'primary') — callers decide how to render it.
 * @param {string} signalType
 * @param {string} componentId
 * @returns {'primary'|'inferred'|null}
 */
export function getRoutingRole(signalType, componentId) {
  return SIGNAL_TO_COMPONENTS[canonicalizeSignalType(signalType)]?.[componentId]?.role ?? null;
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

/**
 * Error on unknown component ids, malformed edges, or a type whose primary-edge
 * presence contradicts its scoring class: non-scoring fallback types must have
 * zero primary edges; every other type needs at least one.
 */
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
  if (NON_SCORING_FALLBACK_TYPES.has(type)) {
    if (hasPrimary) errors.push(`${type}: non-scoring fallback type must not have a primary edge`);
  } else if (!hasPrimary) {
    errors.push(`${type}: no primary edge`);
  }
}

/** Response/capacity construct roles must not positively route into wellbeing_at_risk. */
function checkConstructRole(entry, mapping, errors) {
  const role = entry.construct_role;
  if (role !== 'response' && role !== 'capacity') return;
  const edge = mapping?.wellbeing_at_risk;
  if (edge != null && edge.polarity === '+') {
    errors.push(`${entry.type}: construct_role '${role}' must not route positively into wellbeing_at_risk (treatment uptake is not evidence of wellbeing)`);
  }
}

/**
 * Mirror pairs must route symmetrically (same components, same roles, inverted
 * polarity) unless a documented exception exists in MIRROR_ROUTING_ASYMMETRY.
 * Stale exceptions (pair became symmetric) and empty reasons are also errors.
 */
/** True when both mirror twins route to the same components/roles with inverted polarity. */
function mirrorPairIsSymmetric(a, b) {
  const componentIds = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of componentIds) {
    const ea = a[id];
    const eb = b[id];
    if (!ea || !eb || ea.role !== eb.role || ea.polarity === eb.polarity) return false;
  }
  return true;
}

/** Error message for one mirror pair's symmetry/exception state, or null when consistent. */
function mirrorPairError(key, symmetric, reason) {
  if (!symmetric && reason == null) {
    return `mirror pair ${key}: asymmetric routing without a documented MIRROR_ROUTING_ASYMMETRY reason`;
  }
  if (!symmetric && !String(reason).trim()) {
    return `mirror pair ${key}: asymmetry exception has an empty reason`;
  }
  if (symmetric && reason != null) {
    return `mirror pair ${key}: stale MIRROR_ROUTING_ASYMMETRY entry (routing is symmetric)`;
  }
  return null;
}

function checkMirrorRoutingSymmetry(errors) {
  const seenPairs = new Set();
  for (const entry of SIGNAL_CATALOG) {
    if (!entry.mirror || !CATALOG_BY_TYPE[entry.mirror]) continue;
    const key = [entry.type, entry.mirror].sort().join('|');
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    const symmetric = mirrorPairIsSymmetric(
      SIGNAL_TO_COMPONENTS[entry.type] ?? {},
      SIGNAL_TO_COMPONENTS[entry.mirror] ?? {},
    );
    const err = mirrorPairError(key, symmetric, MIRROR_ROUTING_ASYMMETRY[key]);
    if (err) errors.push(err);
  }
  for (const key of Object.keys(MIRROR_ROUTING_ASYMMETRY)) {
    const [t1, t2] = key.split('|');
    if (!CATALOG_BY_TYPE[t1] || !CATALOG_BY_TYPE[t2] || CATALOG_BY_TYPE[t1].mirror !== t2) {
      errors.push(`MIRROR_ROUTING_ASYMMETRY key is not a catalog mirror pair: ${key}`);
    }
  }
}

/**
 * Routing ↔ catalog coherence check (policy side).
 * Errors are contract violations (CI must fail); warnings are advisory.
 * Ensures every catalog type is mapped, no orphan mappings, no alias keys,
 * well-formed polarity/role edges, ≥1 primary edge per type, and
 * construct_role rules.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateSignalRouting() {
  const errors = [];
  const warnings = [];
  const componentIds = new Set(COMPONENT_IDS);
  for (const alias of Object.keys(SIGNAL_ALIASES)) {
    if (SIGNAL_TO_COMPONENTS[alias]) errors.push(`alias must not have a component mapping: ${alias}`);
  }
  for (const type of NON_SCORING_FALLBACK_TYPES) {
    if (!CATALOG_BY_TYPE[type]) errors.push(`non-scoring fallback type not in catalog: ${type}`);
  }
  for (const entry of SIGNAL_CATALOG) {
    const mapping = SIGNAL_TO_COMPONENTS[entry.type];
    if (!mapping) {
      errors.push(`missing mapping for ${entry.type}`);
      continue;
    }
    checkCatalogEntryPolarity(entry, mapping, warnings);
    checkMappingEdges(entry.type, mapping, componentIds, errors);
    checkConstructRole(entry, mapping, errors);
  }
  for (const type of Object.keys(SIGNAL_TO_COMPONENTS)) {
    if (!CATALOG_BY_TYPE[type]) errors.push(`orphan mapping for ${type}`);
  }
  checkMirrorRoutingSymmetry(errors);
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
