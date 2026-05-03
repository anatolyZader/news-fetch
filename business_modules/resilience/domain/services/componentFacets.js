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
    // Note: rumor_spread/correction were dropped here in N6 — they don't route to leadership;
    // their effect on leadership-perceived credibility is captured indirectly via narrative.
    credibility:  ['leadership_clear_guidance', 'information_confusion', 'feedback_loop_closure'],
    coordination: ['coordination_failure', 'coordination_success'],
  },

  information_communication: {
    clarity:       ['information_clarity', 'information_confusion', 'rumor_spread', 'rumor_correction'],
    accessibility: ['information_inclusivity_present', 'information_inclusivity_gap', 'active_information_seeking'],
    actionability: ['information_actionable_effective', 'information_effectiveness_gap'],
  },

  lifesaving_behavior: {
    compliance:  ['compliance_enter_shelter', 'compliance_follow_instructions',
                  'non_compliance_exit_early', 'non_compliance_ignore_guidelines'],
    knowledge:   ['information_actionable_effective', 'information_effectiveness_gap', 'information_clarity'],
    // Note: leadership_clear_guidance was dropped here in N6 — it does not currently route to
    // lifesaving_behavior. Re-add only after a T3 spillover edge is added to its mapping.
    enforcement: ['risk_exposure_behavior', 'unsafe_gathering', 'panic_behavior'],
  },

  narrative: {
    mood:                 ['fear_expression', 'calm_confidence'],
    coping_story:         ['resilience_narrative_positive', 'resilience_narrative_negative',
                           'post_event_recovery_indicator'],
    competing_narratives: ['rumor_spread', 'rumor_correction', 'harm_to_population', 'cultural_continuity'],
  },

  functional_continuity: {
    essential_services: ['service_continuity', 'service_disruption', 'routine_maintenance'],
    system_load:        ['system_overload', 'system_resilience_under_load'],
    economic:           ['economic_continuity', 'economic_disruption'],
    recovery:           ['post_event_recovery_indicator', 'cultural_continuity'],
  },

  community_capital: {
    mobilization:        ['resource_mobilization', 'community_volunteering', 'self_organization'],
    local_capacity:      ['local_capacity_demonstrated', 'resource_shortage'],
    external_dependency: ['dependency_on_external_aid', 'coordination_success', 'coordination_failure'],
  },

  belonging_solidarity: {
    mutual_aid: ['solidarity_help_others', 'community_volunteering'],
    cohesion:   ['social_isolation', 'conflict_or_tension', 'cultural_continuity'],
    inclusion:  ['self_organization', 'wellbeing_support_accessed'],
  },

  wellbeing_atrisk: {
    physical_harm:          ['harm_to_population'],
    psychological_distress: ['psychological_distress', 'fear_expression', 'calm_confidence'],
    care_access:            ['wellbeing_support_accessed', 'information_inclusivity_present',
                             'information_inclusivity_gap'],
  },
};
