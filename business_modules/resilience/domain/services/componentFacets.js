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
    visibility:   ['leadership_visible_presence', 'leadership_absence'],
    credibility:  ['leadership_clear_guidance', 'information_confusion', 'feedback_loop_closure',
                   'leadership_credibility_loss', 'political_distrust',
                   'civic_engagement_constructive', 'accountability_demand_constructive'],
    competence:   ['consensus_on_priorities', 'dissensus_blocks_action', 'conflict_resolution'],
    coordination: ['coordination_failure', 'coordination_success'],
    civic:        ['civic_engagement_constructive', 'civil_society_mobilization', 'accountability_demand_constructive'],
  },

  information_communication: {
    clarity:       ['information_clarity', 'information_confusion', 'rumor_spread', 'rumor_correction'],
    trust:         ['trusted_information_source', 'mistrusted_information_source',
                    'feedback_channel_open', 'feedback_channel_blocked'],
    accessibility: ['information_inclusivity_present', 'information_inclusivity_gap', 'active_information_seeking'],
    actionability: ['information_actionable_effective', 'information_effectiveness_gap'],
    influence:     ['hostile_influence_operation', 'rumor_spread', 'news_avoidance_behavior', 'media_literacy_demonstrated'],
  },

  lifesaving_behavior: {
    compliance:  ['compliance_enter_shelter', 'compliance_follow_instructions',
                  'non_compliance_exit_early', 'non_compliance_ignore_guidelines',
                  'complacency_or_normalization'],
    knowledge:   ['information_actionable_effective', 'information_effectiveness_gap', 'information_clarity',
                  'leadership_clear_guidance', 'protection_effective'],
    enforcement: ['risk_exposure_behavior', 'unsafe_gathering', 'panic_behavior'],
    preparedness: ['preparedness_drill_conducted', 'preparedness_gap_identified',
                    'protective_infrastructure_present', 'protective_infrastructure_absent',
                    'household_readiness_demonstrated', 'household_readiness_gap'],
  },

  narrative: {
    mood:                 ['fear_expression', 'calm_confidence'],
    coping_story:         ['resilience_narrative_positive', 'resilience_narrative_negative',
                           'post_event_recovery_indicator'],
    competing_narratives: ['rumor_spread', 'rumor_correction', 'harm_to_population', 'cultural_continuity',
                           'hostile_influence_operation'],
  },

  functional_continuity: {
    essential_services: ['service_continuity', 'service_disruption', 'routine_maintenance',
                         'routine_disruption'],
    system_load:        ['system_overload', 'system_resilience_under_load'],
    economic:           ['economic_continuity', 'economic_disruption'],
    recovery:           ['post_event_recovery_indicator', 'cultural_continuity', 'recovery_setback',
                         'compensation_received', 'compensation_blocked', 'displacement_resolved'],
    displacement:       ['evacuation_displacement', 'displacement_resolved'],
    education:          ['educational_continuity', 'educational_disruption'],
    adaptation:         ['adaptive_practice', 'lessons_learned_uptake'],
  },

  community_capital: {
    mobilization:        ['resource_mobilization', 'community_volunteering', 'self_organization',
                          'civil_society_mobilization'],
    local_capacity:      ['local_capacity_demonstrated', 'resource_shortage'],
    external_dependency: ['dependency_on_external_aid', 'coordination_success', 'coordination_failure'],
    collective_action:   ['rapid_mobilization', 'delayed_mobilization', 'conflict_resolution', 'feedback_channel_open'],
  },

  belonging_solidarity: {
    mutual_aid: ['solidarity_help_others', 'community_volunteering', 'interfaith_solidarity'],
    cohesion:   ['social_isolation', 'conflict_or_tension', 'cultural_continuity', 'interfaith_tension'],
    inclusion:  ['self_organization', 'wellbeing_support_accessed'],
    exclusion:  ['inequitable_resource_access', 'information_inclusivity_gap', 'social_isolation'],
  },

  wellbeing_atrisk: {
    physical_harm:          ['harm_to_population'],
    psychological_distress: ['psychological_distress', 'fear_expression', 'calm_confidence', 'child_distress'],
    care_access:            ['wellbeing_support_accessed', 'information_inclusivity_present',
                             'information_inclusivity_gap'],
    equity:                 ['inequitable_resource_access', 'equitable_resource_distribution'],
    household_strain:       ['reservist_family_strain', 'household_strain_economic', 'parental_burden', 'child_distress'],
  },
};
