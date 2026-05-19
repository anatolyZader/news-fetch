/**
 * Per-component facet decomposition. Each facet is a small subset of the
 * signal types that route into the component, scored independently using the
 * same directional math (without per-source caps or bootstrap, to keep facets
 * cheap). Components without an entry here have `facets: null` in scoring output.
 *
 * Used by:
 *   - behaviorSignals.scoreComponents (computes facet scores)
 *   - reportWriter (renders facet bars in markdown)
 *   - ReportView.jsx (renders facet bars in the UI card)
 *
 * All signal types referenced here must exist in SIGNAL_CATALOG and route into
 * the parent component (directly or via T3 spillover) — verified by the unit
 * test "every facet signal type maps to its component".
 */
export const COMPONENT_FACETS = {
  leadership: {
    visibility:   ['leadership_visible_presence', 'leadership_absence', 'symbolic_vs_substantive_action'],
    credibility:  ['leadership_clear_guidance', 'information_confusion', 'feedback_loop_closure',
                   'leadership_credibility_loss', 'political_distrust',
                   'civic_engagement_constructive', 'accountability_demand_constructive',
                   'blame_shifting', 'responsibility_avowal'],
    competence:   ['consensus_on_priorities', 'dissensus_blocks_action', 'conflict_resolution',
                   'delegation_empowerment', 'informal_leadership_emergence'],
    coordination: ['coordination_failure', 'coordination_success'],
    civic:        ['civic_engagement_constructive', 'civil_society_mobilization', 'accountability_demand_constructive'],
    trust:        ['interpersonal_trust', 'institutional_trust', 'media_trust', 'inter_group_trust',
                   'leadership_credibility_loss', 'political_distrust'],
  },

  information_communication: {
    clarity:       ['information_clarity', 'information_confusion', 'rumor_spread', 'rumor_correction'],
    trust:         ['trusted_information_source', 'mistrusted_information_source',
                    'feedback_channel_open', 'feedback_channel_blocked', 'media_trust'],
    accessibility: ['information_inclusivity_present', 'information_inclusivity_gap', 'active_information_seeking',
                    'language_register_mismatch'],
    actionability: ['information_actionable_effective', 'information_effectiveness_gap'],
    influence:     ['hostile_influence_operation', 'rumor_spread', 'news_avoidance_behavior',
                    'media_literacy_demonstrated', 'deepfake_misinformation'],
    overload_vacuum: ['information_overload', 'information_vacuum_post_event',
                      'meta_information_present', 'meta_information_gap'],
    early_warning:   ['early_warning_system_effective', 'early_warning_system_failure'],
  },

  lifesaving_behavior: {
    compliance:  ['compliance_enter_shelter', 'compliance_follow_instructions', 'compliance_partial',
                  'non_compliance_exit_early', 'non_compliance_ignore_guidelines',
                  'non_compliance_due_to_distrust', 'compliance_norm_enforcement',
                  'complacency_or_normalization'],
    knowledge:   ['information_actionable_effective', 'information_effectiveness_gap', 'information_clarity',
                  'leadership_clear_guidance', 'protection_effective', 'near_miss_reported'],
    enforcement: ['risk_exposure_behavior', 'risk_trade_off_behavior', 'unsafe_gathering', 'panic_behavior'],
    preparedness: ['preparedness_drill_conducted', 'preparedness_gap_identified',
                    'protective_infrastructure_present', 'protective_infrastructure_absent',
                    'household_readiness_demonstrated', 'household_readiness_gap',
                    'plan_tested_during_event', 'plan_failed_during_event', 'responder_workforce_strain',
                    'early_warning_system_effective', 'early_warning_system_failure'],
  },

  narrative: {
    mood:                 ['fear_expression', 'calm_confidence'],
    coping_story:         ['resilience_narrative_positive', 'resilience_narrative_negative',
                           'post_event_recovery_indicator', 'future_orientation_hope', 'future_orientation_despair'],
    competing_narratives: ['rumor_spread', 'rumor_correction', 'harm_to_population', 'cultural_continuity',
                           'hostile_influence_operation', 'deepfake_misinformation'],
    framing:              ['blame_narrative', 'heroism_overframing', 'historical_analogy_frame',
                           'moral_injury_narrative', 'institutional_abandonment_perception'],
  },

  functional_continuity: {
    essential_services: ['service_continuity', 'service_disruption', 'routine_maintenance',
                         'routine_disruption'],
    system_load:        ['system_overload', 'system_resilience_under_load'],
    economic:           ['economic_continuity', 'economic_disruption', 'workplace_flexibility_response'],
    recovery:           ['post_event_recovery_indicator', 'cultural_continuity', 'recovery_setback',
                         'compensation_received', 'compensation_blocked', 'displacement_resolved'],
    displacement:       ['evacuation_displacement', 'displacement_resolved'],
    education:          ['educational_continuity', 'educational_disruption', 'learning_loss_documented',
                         'educational_equity_gap'],
    adaptation:         ['adaptive_practice', 'lessons_learned_uptake', 'innovation_under_constraint',
                         'failure_to_adapt', 'cross_event_learning'],
    supply_food:        ['supply_chain_disruption', 'food_security_stress', 'food_security_maintained',
                         'infrastructure_damage_acute', 'connectivity_outage'],
    displacement_extended: ['evacuation_displacement', 'displacement_resolved', 'self_evacuation_unauthorized'],
  },

  community_capital: {
    mobilization:        ['resource_mobilization', 'community_volunteering', 'self_organization',
                          'civil_society_mobilization', 'digital_mutual_aid'],
    local_capacity:      ['local_capacity_demonstrated', 'resource_shortage', 'volunteer_donor_fatigue'],
    external_dependency: ['dependency_on_external_aid', 'international_aid_arrival', 'international_aid_withdrawal'],
    collective_action:   ['rapid_mobilization', 'delayed_mobilization', 'conflict_resolution',
                          'feedback_channel_open', 'coordination_success', 'coordination_failure'],
    allocation:          ['resource_allocation_transparency', 'resource_allocation_opacity'],
  },

  belonging_solidarity: {
    mutual_aid: ['solidarity_help_others', 'community_volunteering', 'interfaith_solidarity', 'digital_mutual_aid'],
    cohesion:   ['social_isolation', 'conflict_or_tension', 'cultural_continuity', 'interfaith_tension',
                 'commemoration_event_observed', 'memorialization_conflict'],
    inclusion:  ['self_organization', 'wellbeing_support_accessed', 'bridging_capital_demonstrated'],
    exclusion:  ['inequitable_resource_access', 'information_inclusivity_gap', 'social_isolation',
                 'bridging_capital_failure', 'prosocial_norm_violation'],
    bridging:   ['bridging_capital_demonstrated', 'bridging_capital_failure', 'help_seeking_behavior',
                 'inter_group_trust'],
  },

  wellbeing_atrisk: {
    physical_harm:          ['harm_to_population', 'near_miss_reported'],
    psychological_distress: ['psychological_distress', 'fear_expression', 'child_distress'],
    affect_balance:         ['calm_confidence', 'fear_expression', 'positive_wellbeing_marker'],
    care_access:            ['wellbeing_support_accessed', 'information_inclusivity_present',
                             'information_inclusivity_gap', 'school_psychosocial_support_active',
                             'school_psychosocial_support_gap'],
    equity:                 ['inequitable_resource_access', 'equitable_resource_distribution', 'educational_equity_gap'],
    household_strain:       ['reservist_family_strain', 'household_strain_economic', 'parental_burden',
                             'sleep_disruption_population', 'substance_use_uptick'],
    population_evidence:    ['population_survey_finding', 'sleep_disruption_population'],
    sensitive_harm:         ['domestic_violence_indicator', 'suicide_self_harm_indicator'],
    hostage:                ['hostage_uncertainty_distress', 'hostage_return_event', 'hostage_family_advocacy'],
  },
};
