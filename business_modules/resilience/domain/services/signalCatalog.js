/**
 * Closed-vocabulary signal catalog and component routing (v5).
 */

export const CATALOG_VERSION = 'v6';

export const SIGNAL_DOMAINS = {
  compliance: "Compliance & Discipline",
  risk: "Risk & Safety",
  social: "Social Cohesion",
  leadership: "Leadership & Governance",
  information: "Information & Communication",
  continuity: "Functional Continuity",
  narrative: "Emotional / Narrative",
  resources: "Community Resources",
  wellbeing: "Population Wellbeing",
  preparedness: "Preparedness & Protective Capacity",
  adaptation: "Adaptation & Learning",
  education: "Children & Education",
  trust: "Trust & Legitimacy",
  memory: "Memory & Commemoration",
  diaspora: "Diaspora & Outside-In Support",
  environmental: "Environmental & Agricultural Impact",
  hostage: "Hostage & Captivity",
  cyber: "Cyber & Digital Infrastructure"
};

/** @typedef {'behavior'|'attitude'|'structural_state'|'narrative'|'event'|'capacity'} SignalClass */

export const DEFAULT_SCORING_PRIORS = {
  expected_phases: ['anticipation', 'response', 'recovery'],
  time_horizon: 'episodic',
  reversibility: 'reversible',
  phase_mismatch_discount: 1,
  temporal_half_life_days: null,
  intensity_floor: null,
  allowed_intensities: ['light', 'moderate', 'severe'],
  expects_quantification: false,
  expected_subgroups: [],
  reliability_override: null,
};

/**
 * All valid signal types the LLM may emit.
 * @type {Array<{ type: string, domain: string, label: string, defaultPolarity: 'positive'|'negative', signal_class: SignalClass, mirror?: string, scoringPriors?: object, disambiguation?: { not_confused_with?: string[], accept_patterns?: string[], reject_patterns?: string[] }, example_evidence?: string[], norris_capacity?: string }>}
 */
export const SIGNAL_CATALOG = [
  // Compliance & Discipline
  { type: 'compliance_enter_shelter', domain: 'compliance', signal_class: 'behavior', label: 'Residents enter shelter when alerted', defaultPolarity: 'positive', mirror: 'non_compliance_exit_early' },
  { type: 'compliance_follow_instructions', domain: 'compliance', signal_class: 'behavior', label: 'Residents follow official protective instructions', defaultPolarity: 'positive' },
  { type: 'non_compliance_exit_early', domain: 'compliance', signal_class: 'behavior', label: 'Residents leave shelter before all-clear', defaultPolarity: 'negative' },
  { type: 'non_compliance_ignore_guidelines', domain: 'compliance', signal_class: 'behavior', label: 'Residents ignore or dismiss safety guidelines', defaultPolarity: 'negative' },
  { type: 'compliance_partial', domain: 'compliance', signal_class: 'behavior', label: 'Residents enter shelter or follow instructions incompletely (late entry, partial compliance)', defaultPolarity: 'positive', mirror: 'non_compliance_exit_early' },
  { type: 'non_compliance_due_to_distrust', domain: 'compliance', signal_class: 'behavior', label: 'Residents refuse protective guidance because they distrust the source or alert system', defaultPolarity: 'negative', mirror: 'non_compliance_ignore_guidelines',
    disambiguation: {
      not_confused_with: ['mistrusted_information_source', 'non_compliance_ignore_guidelines'],
      accept_patterns: ['residents ignore sirens because they no longer trust HFC alerts'],
    },
  },
  { type: 'compliance_norm_enforcement', domain: 'compliance', signal_class: 'behavior', label: 'Community members informally pressure others to follow safety protocols', defaultPolarity: 'positive' },
  // Risk & Safety
  { type: 'risk_exposure_behavior', domain: 'risk', signal_class: 'behavior', label: 'Residents expose themselves to risk (filming, staying outside)', defaultPolarity: 'negative' },
  { type: 'panic_behavior', domain: 'risk', signal_class: 'behavior', label: 'Chaotic or unsafe reactions during alerts', defaultPolarity: 'negative' },
  { type: 'unsafe_gathering', domain: 'risk', signal_class: 'behavior', label: 'Gatherings that violate safety guidelines', defaultPolarity: 'negative' },
  { type: 'protection_effective', domain: 'risk', signal_class: 'structural_state', label: 'A defensive measure demonstrably averted harm (Iron Dome interception, mamad/shelter doctrine, drill saved lives in documented hit)', defaultPolarity: 'positive' },
  { type: 'near_miss_reported', domain: 'risk', signal_class: 'event', label: 'Documented close call where protective measures barely prevented harm', defaultPolarity: 'negative', scoringPriors: { expected_phases: ['response'], temporal_half_life_days: 14 } },
  { type: 'risk_trade_off_behavior', domain: 'risk', signal_class: 'behavior', label: 'Residents take calculated risk to reduce another harm (e.g. driving during alert to relieve childcare burden)', defaultPolarity: 'negative', mirror: 'risk_exposure_behavior' },
  // Social Cohesion
  { type: 'solidarity_help_others', domain: 'social', signal_class: 'behavior', label: 'Residents help neighbors, strangers, or community members', defaultPolarity: 'positive', mirror: 'social_isolation',
    disambiguation: {
      not_confused_with: ['harm_to_population', 'community_volunteering'],
      accept_patterns: ['residents brought food to elderly neighbors who could not reach shelters'],
      reject_patterns: ['witnessing injured neighbors without a helping act', 'co-location in a shelter without assistance'],
    },
    example_evidence: ['Residents brought food to elderly neighbors who could not reach shelters'],
  },
  { type: 'community_volunteering', domain: 'social', signal_class: 'behavior', label: 'Organized or spontaneous volunteering', defaultPolarity: 'positive' },
  { type: 'social_isolation', domain: 'social', signal_class: 'behavior', label: 'Residents withdraw, are isolated, or excluded', defaultPolarity: 'negative', mirror: 'solidarity_help_others' },
  { type: 'conflict_or_tension', domain: 'social', signal_class: 'behavior', label: 'Reported conflicts, scapegoating, or inter-group tension', defaultPolarity: 'negative' },
  { type: 'conflict_resolution', domain: 'social', signal_class: 'behavior', label: 'Community actors resolve conflicts constructively, enabling cooperation (mediation, compromise, de-escalation)', defaultPolarity: 'positive' },
  { type: 'religious_coping_practice', domain: 'social', signal_class: 'behavior', label: 'Faith-based communal coping (prayer assemblies, tehillim groups, ritualized mourning)', defaultPolarity: 'positive' },
  { type: 'interfaith_solidarity', domain: 'social', signal_class: 'behavior', label: 'Constructive cooperation across religious lines during the emergency', defaultPolarity: 'positive' },
  { type: 'interfaith_tension', domain: 'social', signal_class: 'behavior', label: 'Conflict or tension specifically along religious lines', defaultPolarity: 'negative' },
  { type: 'help_seeking_behavior', domain: 'social', signal_class: 'behavior', label: 'Residents actively ask neighbors or institutions for help (distinct from offering help)', defaultPolarity: 'positive' },
  { type: 'bridging_capital_demonstrated', domain: 'social', signal_class: 'behavior', label: 'Constructive cooperation across class, ethnic, or geographic lines (not only religious)', defaultPolarity: 'positive', mirror: 'interfaith_solidarity' },
  { type: 'bridging_capital_failure', domain: 'social', signal_class: 'behavior', label: 'Cooperation across community lines breaks down or is blocked', defaultPolarity: 'negative', mirror: 'interfaith_tension' },
  { type: 'prosocial_norm_violation', domain: 'social', signal_class: 'behavior', label: 'Free-riding or norm-breaking in shared emergency resources (shelter hogging, aid queue jumping)', defaultPolarity: 'negative' },
  // Leadership & Governance
  { type: 'leadership_visible_presence', domain: 'leadership', signal_class: 'structural_state', label: 'Leadership is publicly visible and active', defaultPolarity: 'positive', mirror: 'leadership_absence' },
  { type: 'leadership_clear_guidance', domain: 'leadership', signal_class: 'structural_state', label: 'Leadership provides clear, specific directions', defaultPolarity: 'positive',
    disambiguation: {
      not_confused_with: ['information_clarity', 'information_actionable_effective', 'political_distrust'],
      accept_patterns: ['mayor announced shelter hours for the municipality', 'HFC approved easing of restrictions for northern residents'],
      reject_patterns: ['pundit strategy commentary', 'civilian demanding accountability without actionable guidance'],
    },
  },
  { type: 'leadership_absence', domain: 'leadership', signal_class: 'structural_state', label: 'Leadership is absent, unavailable, or unresponsive', defaultPolarity: 'negative', mirror: 'leadership_visible_presence' },
  { type: 'leadership_credibility_loss', domain: 'leadership', signal_class: 'attitude', label: 'Residents or affected groups voice concrete loss of trust in named leadership (broken promises, false reassurances, perceived dishonesty about emergency conditions)', defaultPolarity: 'negative' },
  { type: 'political_distrust', domain: 'leadership', signal_class: 'attitude', label: 'Residents or named civic figures publicly demand accountability or express distrust of the political/governmental handling of the emergency (specific policy demands, not general partisan opinion)', defaultPolarity: 'negative',
    disambiguation: {
      not_confused_with: ['leadership_credibility_loss', 'resilience_narrative_negative', 'institutional_abandonment_perception'],
      accept_patterns: ['named mayor demands PM clarify northern return policy'],
      reject_patterns: ['generic partisan opinion without emergency-specific demand'],
    },
  },
  { type: 'consensus_on_priorities', domain: 'leadership', signal_class: 'structural_state', label: 'Community actors reach working consensus on goals/priorities and a plan for action (collaboration, agreement on what to do next)', defaultPolarity: 'positive' },
  { type: 'dissensus_blocks_action', domain: 'leadership', signal_class: 'structural_state', label: 'Mistrust/conflict prevents working consensus or blocks collective action (dissensus, infighting, inability to agree on priorities)', defaultPolarity: 'negative' },
  { type: 'coordination_failure', domain: 'leadership', signal_class: 'structural_state', label: 'Inter-agency or inter-organization coordination breaks down', defaultPolarity: 'negative' },
  { type: 'coordination_success', domain: 'leadership', signal_class: 'structural_state', label: 'Multiple agencies, services, or organizations coordinate effectively in response', defaultPolarity: 'positive' },
  { type: 'feedback_loop_closure', domain: 'leadership', signal_class: 'structural_state', label: 'Authorities visibly act on community input, complaints, or requests', defaultPolarity: 'positive' },
  { type: 'civic_engagement_constructive', domain: 'leadership', signal_class: 'behavior', label: 'Constructive civic participation (public hearings, lawful protest with concrete demands, organized petitioning)', defaultPolarity: 'positive' },
  { type: 'civil_society_mobilization', domain: 'leadership', signal_class: 'structural_state', label: 'NGOs or civil-society organizations step up with organized non-state response', defaultPolarity: 'positive' },
  { type: 'accountability_demand_constructive', domain: 'leadership', signal_class: 'behavior', label: 'Public requests for explanations that are answered or visibly addressed (distinct from unanswered political_distrust)', defaultPolarity: 'positive' },
  { type: 'informal_leadership_emergence', domain: 'leadership', signal_class: 'structural_state', label: 'Non-official community figures step up with visible coordination or guidance', defaultPolarity: 'positive' },
  { type: 'blame_shifting', domain: 'leadership', signal_class: 'attitude', label: 'Named leaders deflect responsibility rather than address the emergency', defaultPolarity: 'negative' },
  { type: 'responsibility_avowal', domain: 'leadership', signal_class: 'attitude', label: 'Named leaders publicly accept responsibility and commit to corrective action', defaultPolarity: 'positive', mirror: 'blame_shifting' },
  { type: 'symbolic_vs_substantive_action', domain: 'leadership', signal_class: 'structural_state', label: 'Leadership visibility without substantive delivery (photo-ops, empty gestures)', defaultPolarity: 'negative', mirror: 'leadership_visible_presence' },
  { type: 'delegation_empowerment', domain: 'leadership', signal_class: 'structural_state', label: 'Central authority devolves decision-making to local actors effectively', defaultPolarity: 'positive' },
  // Information & Communication
  { type: 'information_clarity', domain: 'information', signal_class: 'structural_state', label: 'Residents report receiving clear, useful information', defaultPolarity: 'positive' },
  { type: 'information_confusion', domain: 'information', signal_class: 'structural_state', label: 'Residents report confusion, contradictory, or missing information', defaultPolarity: 'negative',
    disambiguation: {
      not_confused_with: ['information_overload', 'information_effectiveness_gap', 'service_disruption'],
      reject_patterns: ['education policy dispute without safety guidance confusion'],
    },
  },
  { type: 'rumor_spread', domain: 'information', signal_class: 'structural_state', label: 'Rumors or misinformation are circulating', defaultPolarity: 'negative', mirror: 'rumor_correction' },
  { type: 'rumor_correction', domain: 'information', signal_class: 'structural_state', label: 'Authorities, experts, or community members visibly correct circulating rumors or misinformation', defaultPolarity: 'positive', mirror: 'rumor_spread' },
  { type: 'trusted_information_source', domain: 'information', signal_class: 'structural_state', label: 'Residents rely on or explicitly trust a specific local/official source for emergency information (trusted hotline, known local authority, trusted broadcaster)', defaultPolarity: 'positive' },
  { type: 'mistrusted_information_source', domain: 'information', signal_class: 'structural_state', label: 'Residents explicitly distrust or disregard an emergency information source (source seen as unreliable/lying/ignored), reducing adherence', defaultPolarity: 'negative' },
  { type: 'feedback_channel_open', domain: 'information', signal_class: 'structural_state', label: 'A working channel exists for the public to ask questions / articulate needs and receive responses (hotline, municipal desk, two-way messaging)', defaultPolarity: 'positive' },
  { type: 'feedback_channel_blocked', domain: 'information', signal_class: 'structural_state', label: 'Public feedback/inquiry channels are absent, unreachable, or ignored (hotline down, no response, no way to ask/clarify)', defaultPolarity: 'negative' },
  { type: 'active_information_seeking', domain: 'information', signal_class: 'behavior', label: 'Residents actively seek out emergency or protective guidance — shelter locations, HFC instructions, evacuation routes, operational alerts. NOT: legal, financial, religious, or personal planning information.', defaultPolarity: 'positive' },
  { type: 'information_actionable_effective', domain: 'information', signal_class: 'structural_state', label: 'Guidance is specific, situation-matched, and demonstrably leads to correct protective behavior', defaultPolarity: 'positive',
    disambiguation: {
      not_confused_with: ['leadership_clear_guidance', 'information_clarity'],
      accept_patterns: ['residents reported the new app delivered alerts fast enough to reach shelter'],
      reject_patterns: ['routine alert issuance without evidence of reception or behavioral response'],
    },
  },
  { type: 'information_effectiveness_gap', domain: 'information', signal_class: 'structural_state', label: 'Guidance exists but fails to help — does not match real constraints, too vague to act on, or leaves critical scenarios uncovered', defaultPolarity: 'negative' },
  { type: 'information_inclusivity_present', domain: 'information', signal_class: 'structural_state', label: 'Emergency information adapted for at-risk groups (Arabic translations, accessible formats, elder outreach, special-needs channels)', defaultPolarity: 'positive' },
  { type: 'information_inclusivity_gap', domain: 'information', signal_class: 'structural_state', label: 'Emergency information not reaching at-risk groups (no Arabic, inaccessible formats, elders/disabled left uninformed)', defaultPolarity: 'negative' },
  { type: 'hostile_influence_operation', domain: 'information', signal_class: 'structural_state', label: 'Identified foreign or coordinated disinformation push (state actors, bot networks) — distinct from organic rumor_spread', defaultPolarity: 'negative' },
  { type: 'news_avoidance_behavior', domain: 'information', signal_class: 'behavior', label: 'Residents intentionally tune out emergency news or alerts as coping', defaultPolarity: 'negative' },
  { type: 'media_literacy_demonstrated', domain: 'information', signal_class: 'behavior', label: 'Ordinary residents (not authorities) visibly correct misinformation or verify claims', defaultPolarity: 'positive' },
  { type: 'information_overload', domain: 'information', signal_class: 'structural_state', label: 'Residents overwhelmed by volume of alerts or conflicting streams (distinct from confusion about content)', defaultPolarity: 'negative', mirror: 'information_confusion' },
  { type: 'information_vacuum_post_event', domain: 'information', signal_class: 'structural_state', label: 'Communication drops off after acute phase leaving residents uninformed', defaultPolarity: 'negative' },
  { type: 'language_register_mismatch', domain: 'information', signal_class: 'structural_state', label: 'Emergency guidance uses register or language residents cannot understand or act on', defaultPolarity: 'negative', mirror: 'information_effectiveness_gap' },
  { type: 'meta_information_present', domain: 'information', signal_class: 'structural_state', label: 'Authorities tell residents when the next update will come or what is still unknown', defaultPolarity: 'positive', mirror: 'meta_information_gap' },
  { type: 'meta_information_gap', domain: 'information', signal_class: 'structural_state', label: 'No timeline or commitment for next information — residents left in uncertainty about future updates', defaultPolarity: 'negative', mirror: 'meta_information_present' },
  // Functional Continuity
  { type: 'service_continuity', domain: 'continuity', signal_class: 'structural_state', label: 'Essential services or institutions are operating', defaultPolarity: 'positive' },
  { type: 'service_disruption', domain: 'continuity', signal_class: 'structural_state', label: 'Essential services, schools, or businesses are closed/disrupted', defaultPolarity: 'negative',
    disambiguation: {
      not_confused_with: ['economic_disruption', 'resource_shortage', 'fear_expression', 'routine_disruption'],
      accept_patterns: ['restaurant closed due to rocket fire', 'factory operations halted in the envelope'],
      reject_patterns: ['business owner expressing fear without closure fact', 'missing compensation payment without service closure'],
    },
  },
  { type: 'routine_maintenance', domain: 'continuity', signal_class: 'behavior', label: 'Residents maintain normal daily routines', defaultPolarity: 'positive' },
  { type: 'routine_disruption', domain: 'continuity', signal_class: 'structural_state', label: 'Civilian daily routines (commuting, shopping, leisure, social rhythms) are visibly disrupted by the emergency — distinct from named-institution closures, which are service_disruption', defaultPolarity: 'negative' },
  { type: 'evacuation_displacement', domain: 'continuity', signal_class: 'event', label: 'Residents are evacuated, displaced, or unable to return home because of the emergency (named community, hotel/relative housing, prolonged absence)', defaultPolarity: 'negative', mirror: 'displacement_resolved', scoringPriors: {"expected_phases":["response","recovery"],"time_horizon":"episodic","reversibility":"partial","expects_quantification":true,"temporal_half_life_days":21},
    disambiguation: {
      not_confused_with: ['self_evacuation_unauthorized', 'routine_disruption'],
      accept_patterns: ['municipality evacuated 900 residents to hotels'],
    },
  },
  { type: 'self_evacuation_unauthorized', domain: 'continuity', signal_class: 'behavior', label: 'Residents leave home or community without official evacuation order (self-evacuation, unauthorized departure)', defaultPolarity: 'negative', mirror: 'evacuation_displacement',
    disambiguation: {
      not_confused_with: ['evacuation_displacement', 'routine_disruption'],
      accept_patterns: ['families left the town on their own before any official order'],
      reject_patterns: ['official municipality evacuation to hotels'],
    },
    example_evidence: ['Residents self-evacuated from Kiryat Shmona before the municipality issued orders'],
  },
  { type: 'displacement_resolved', domain: 'continuity', signal_class: 'event', label: 'Evacuees return home or displacement is visibly resolved (mirror of evacuation_displacement)', defaultPolarity: 'positive', scoringPriors: { expected_phases: ['recovery'], temporal_half_life_days: 21 } },
  { type: 'system_overload', domain: 'continuity', signal_class: 'structural_state', label: 'Systems (healthcare, emergency, infrastructure) are overwhelmed', defaultPolarity: 'negative', mirror: 'system_resilience_under_load' },
  { type: 'system_resilience_under_load', domain: 'continuity', signal_class: 'structural_state', label: 'A named system continues operating effectively despite documented elevated demand or disruption', defaultPolarity: 'positive', mirror: 'system_overload' },
  { type: 'economic_continuity', domain: 'continuity', signal_class: 'structural_state', label: 'Local economic activity (employment, business, commerce) sustains during the emergency', defaultPolarity: 'positive' },
  { type: 'economic_disruption', domain: 'continuity', signal_class: 'structural_state', label: 'Local economic activity is disrupted: business closures, lost income, employment freeze due to the emergency', defaultPolarity: 'negative',
    disambiguation: { not_confused_with: ['service_disruption', 'household_strain_economic', 'resource_shortage'] },
  },
  { type: 'post_event_recovery_indicator', domain: 'continuity', signal_class: 'event', label: 'Communities visibly recover after a hit: re-opening, return of evacuees, resumed routines', defaultPolarity: 'positive', scoringPriors: { expected_phases: ['recovery'], temporal_half_life_days: 21 } },
  { type: 'recovery_setback', domain: 'continuity', signal_class: 'event', label: 'Recovery reverses: reopened services close again, repairs fail, evacuees cannot stay home', defaultPolarity: 'negative', scoringPriors: { expected_phases: ['recovery'], temporal_half_life_days: 21 } },
  { type: 'compensation_received', domain: 'continuity', signal_class: 'structural_state', label: 'Affected residents or businesses receive promised compensation (Property Tax Fund, pitsuim, grants)', defaultPolarity: 'positive' },
  { type: 'compensation_blocked', domain: 'continuity', signal_class: 'structural_state', label: 'Promised compensation or aid payments are delayed, denied, or not reaching claimants', defaultPolarity: 'negative' },
  { type: 'cultural_continuity', domain: 'continuity', signal_class: 'narrative', label: 'Identity-bearing rituals, ceremonies, holidays, or cultural events take place during the emergency', defaultPolarity: 'positive' },
  { type: 'rapid_mobilization', domain: 'continuity', signal_class: 'structural_state', label: 'Resources/services are mobilized quickly to meet needs (rapid access, timely restoration, fast deployment)', defaultPolarity: 'positive' },
  { type: 'delayed_mobilization', domain: 'continuity', signal_class: 'structural_state', label: 'Resources/services are mobilized too slowly, increasing disruption (slow response, delays in opening/repairing/deploying)', defaultPolarity: 'negative' },
  { type: 'supply_chain_disruption', domain: 'continuity', signal_class: 'structural_state', label: 'Inputs to essential services fail (logistics, procurement, distribution)', defaultPolarity: 'negative', mirror: 'service_disruption' },
  { type: 'food_security_stress', domain: 'continuity', signal_class: 'structural_state', label: 'Community faces food access stress due to the emergency', defaultPolarity: 'negative', mirror: 'food_security_maintained' },
  { type: 'food_security_maintained', domain: 'continuity', signal_class: 'structural_state', label: 'Food supply and access remain adequate despite the emergency', defaultPolarity: 'positive', mirror: 'food_security_stress' },
  { type: 'infrastructure_damage_acute', domain: 'continuity', signal_class: 'event', label: 'Physical damage to power, roads, water, or buildings from the emergency', defaultPolarity: 'negative', scoringPriors: { expected_phases: ['response', 'recovery'], temporal_half_life_days: 21 } },
  { type: 'connectivity_outage', domain: 'continuity', signal_class: 'structural_state', label: 'Telecom, internet, or mobile connectivity failure affecting emergency communication or daily function', defaultPolarity: 'negative', mirror: 'service_continuity',
    disambiguation: { not_confused_with: ['cyber_attack_on_infrastructure', 'information_confusion'] },
    example_evidence: ['Cell networks down in western Galilee after rocket hits on infrastructure'],
    scoringPriors: { expected_subgroups: [], expects_quantification: false },
  },
  { type: 'workplace_flexibility_response', domain: 'continuity', signal_class: 'structural_state', label: 'Employers adjust work (WFH, paid leave) to reduce household strain during emergency', defaultPolarity: 'positive' },
  // Emotional / Narrative
  { type: 'fear_expression', domain: 'narrative', signal_class: 'attitude', label: 'Residents express fear, anxiety, or trauma', defaultPolarity: 'negative',
    disambiguation: {
      not_confused_with: ['psychological_distress', 'service_disruption', 'economic_disruption'],
      accept_patterns: ['named resident: I have not slept since the sirens started'],
      reject_patterns: ['business viability worry without safety fear'],
    },
  },
  { type: 'calm_confidence', domain: 'narrative', signal_class: 'attitude', label: 'Residents express calm, confidence, or sense of control', defaultPolarity: 'positive' },
  { type: 'resilience_narrative_positive', domain: 'narrative', signal_class: 'narrative', label: 'Residents describe the community as coping effectively', defaultPolarity: 'positive',
    disambiguation: {
      not_confused_with: ['service_continuity', 'routine_maintenance', 'leadership_clear_guidance'],
      accept_patterns: ['residents here say we are managing fine despite the rockets'],
      reject_patterns: ['official declaring national spirit', 'list of closed businesses or empty streets'],
    },
  },
  { type: 'resilience_narrative_negative', domain: 'narrative', signal_class: 'narrative', label: 'Residents contradict or reject the official coping narrative', defaultPolarity: 'negative',
    disambiguation: {
      not_confused_with: ['political_distrust', 'institutional_abandonment_perception', 'service_disruption'],
      accept_patterns: ['the spirit in the north has broken', 'residents feel abandoned by the state'],
      reject_patterns: ['politician demanding policy change without community mood framing'],
    },
  },
  { type: 'institutional_abandonment_perception', domain: 'narrative', signal_class: 'narrative', label: 'Residents describe feeling abandoned or forgotten by state institutions during the emergency', defaultPolarity: 'negative', mirror: 'resilience_narrative_positive',
    disambiguation: {
      not_confused_with: ['political_distrust', 'resource_shortage'],
      accept_patterns: ['residents say the state forgot us in the north'],
      reject_patterns: ['named policy demand with specific accountability target → political_distrust'],
    },
    example_evidence: ['Evacuees: we feel the state abandoned us with no timeline to return home'],
  },
  { type: 'blame_narrative', domain: 'narrative', signal_class: 'narrative', label: 'Population-level attribution of fault for the emergency or response failure', defaultPolarity: 'negative' },
  { type: 'heroism_overframing', domain: 'narrative', signal_class: 'narrative', label: 'Heroism stories obscure systemic failures or unmet needs', defaultPolarity: 'negative' },
  { type: 'historical_analogy_frame', domain: 'narrative', signal_class: 'narrative', label: 'Explicit invocation of past wars or traumas to frame the present emergency', defaultPolarity: 'negative' },
  { type: 'future_orientation_hope', domain: 'narrative', signal_class: 'attitude', label: 'Residents express hope or constructive forward-looking orientation', defaultPolarity: 'positive', mirror: 'future_orientation_despair' },
  { type: 'future_orientation_despair', domain: 'narrative', signal_class: 'attitude', label: 'Residents express hopelessness about the future or prolonged emergency', defaultPolarity: 'negative', mirror: 'future_orientation_hope' },
  { type: 'moral_injury_narrative', domain: 'narrative', signal_class: 'attitude', label: 'Residents describe ethical violation of their own moral code (distinct from political_distrust)', defaultPolarity: 'negative' },
  // Community Resources
  { type: 'resource_mobilization', domain: 'resources', signal_class: 'structural_state', label: 'Community or authority mobilizes material/human resources', defaultPolarity: 'positive', mirror: 'resource_shortage' },
  { type: 'resource_shortage', domain: 'resources', signal_class: 'structural_state', label: 'Community reports shortage of resources, services, or support', defaultPolarity: 'negative', mirror: 'resource_mobilization',
    disambiguation: {
      not_confused_with: ['service_disruption', 'economic_disruption', 'compensation_blocked'],
      accept_patterns: ['not a single shekel of compensation has reached business owners'],
      reject_patterns: ['business closed due to rockets without named aid gap'],
    },
  },
  { type: 'self_organization', domain: 'resources', signal_class: 'behavior', label: 'Community organizes itself without external direction', defaultPolarity: 'positive' },
  { type: 'dependency_on_external_aid', domain: 'resources', signal_class: 'structural_state', label: 'Community depends heavily on external aid due to local capacity gaps', defaultPolarity: 'negative', mirror: 'local_capacity_demonstrated' },
  { type: 'local_capacity_demonstrated', domain: 'resources', signal_class: 'capacity', label: 'Community demonstrates self-reliant capacity (own funds, own labour, own infrastructure) without leaning on outside aid', defaultPolarity: 'positive', mirror: 'dependency_on_external_aid' },
  { type: 'volunteer_donor_fatigue', domain: 'resources', signal_class: 'structural_state', label: 'Volunteer or donor capacity visibly exhausted in protracted emergency', defaultPolarity: 'negative', scoringPriors: { time_horizon: 'cumulative', temporal_half_life_days: 21 } },
  { type: 'digital_mutual_aid', domain: 'resources', signal_class: 'behavior', label: 'Crowdfunding, WhatsApp/Telegram mutual-aid channels mobilize resources', defaultPolarity: 'positive', mirror: 'self_organization' },
  { type: 'resource_allocation_transparency', domain: 'resources', signal_class: 'structural_state', label: 'Aid distribution rules and outcomes are visible and accepted', defaultPolarity: 'positive', mirror: 'resource_allocation_opacity' },
  { type: 'resource_allocation_opacity', domain: 'resources', signal_class: 'structural_state', label: 'Aid distribution opaque or perceived as unfair without explanation', defaultPolarity: 'negative', mirror: 'resource_allocation_transparency' },
  // Population Wellbeing
  { type: 'harm_to_population', domain: 'wellbeing', signal_class: 'event', label: 'Physical harm occurred in the community: casualties, injuries, civilians wounded or killed', defaultPolarity: 'negative', scoringPriors: {"expected_phases":["response","recovery"],"time_horizon":"instant","reversibility":"irreversible","allowed_intensities":["moderate","severe"],"expects_quantification":true,"intensity_floor":"moderate","temporal_half_life_days":30},
    disambiguation: {
      not_confused_with: ['solidarity_help_others', 'near_miss_reported'],
      accept_patterns: ['61-year-old injured by shrapnel from Hezbollah rocket barrage in Tamra'],
      reject_patterns: ['traffic accident', 'hiking fall', 'off-duty crime'],
    },
  },
  { type: 'psychological_distress', domain: 'wellbeing', signal_class: 'attitude', label: 'Named individual or survey reports accumulated trauma, PTSD, grief, or chronic sleep disruption — distinct from situational fear', defaultPolarity: 'negative' },
  { type: 'wellbeing_support_accessed', domain: 'wellbeing', signal_class: 'structural_state', label: 'Individuals or groups access psychological support, trauma care, or community wellbeing programs', defaultPolarity: 'positive' },
  { type: 'inequitable_resource_access', domain: 'wellbeing', signal_class: 'structural_state', label: 'Unequal access to safety/resources/services across subgroups (disparities, exclusion of vulnerable populations)', defaultPolarity: 'negative' },
  { type: 'equitable_resource_distribution', domain: 'wellbeing', signal_class: 'structural_state', label: 'Resources/support are distributed fairly based on needs (equity-aware allocation, non-disparate access)', defaultPolarity: 'positive' },
  { type: 'child_distress', domain: 'wellbeing', signal_class: 'attitude', label: 'Children-specific psychological distress (regression, separation anxiety, school refusal) — distinct from general psychological_distress', defaultPolarity: 'negative' },
  { type: 'parental_burden', domain: 'wellbeing', signal_class: 'structural_state', label: 'Parents bear childcare burden during sheltering or school closure', defaultPolarity: 'negative', scoringPriors: { time_horizon: 'cumulative', temporal_half_life_days: 14 } },
  { type: 'reservist_family_strain', domain: 'wellbeing', signal_class: 'structural_state', label: 'Household strain from long reserve deployment (single parent, lost wages, absence)', defaultPolarity: 'negative', scoringPriors: { time_horizon: 'cumulative', temporal_half_life_days: 21 } },
  { type: 'household_strain_economic', domain: 'wellbeing', signal_class: 'structural_state', label: 'Household cannot pay rent or faces wage loss — distinct from macro economic_disruption', defaultPolarity: 'negative' },
  { type: 'sleep_disruption_population', domain: 'wellbeing', signal_class: 'attitude', label: 'Population-level sleep disruption reported (surveys, clinics, named patterns)', defaultPolarity: 'negative' },
  { type: 'substance_use_uptick', domain: 'wellbeing', signal_class: 'behavior', label: 'Documented increase in alcohol, cannabis, or anxiolytic use as coping', defaultPolarity: 'negative' },
  { type: 'domestic_violence_indicator', domain: 'wellbeing', signal_class: 'event', label: 'Reported fact of domestic violence increase — requires explicit evidence, never infer', defaultPolarity: 'negative', scoringPriors: {"expected_phases":["response","recovery"],"intensity_floor":"moderate","expects_quantification":false} },
  { type: 'suicide_self_harm_indicator', domain: 'wellbeing', signal_class: 'event', label: 'Reported fact of suicide or self-harm — requires explicit evidence, never infer', defaultPolarity: 'negative', scoringPriors: {"expected_phases":["response","recovery"],"intensity_floor":"moderate","expects_quantification":false} },
  { type: 'population_survey_finding', domain: 'wellbeing', signal_class: 'structural_state', label: 'Named survey or institutional study reports a measured population-level finding (sleep, distress, compliance rates)', defaultPolarity: 'negative', mirror: 'positive_wellbeing_marker',
    disambiguation: {
      not_confused_with: ['fear_expression', 'psychological_distress', 'sleep_disruption_population'],
      accept_patterns: ['Bar-Ilan survey: 68% of northern residents report sleep disruption'],
      reject_patterns: ['single unnamed quote without survey source'],
    },
    example_evidence: ['MDA: 790 people injured reaching shelters during March alerts'],
    scoringPriors: { expects_quantification: true, allowed_intensities: ['moderate', 'severe'] },
  },
  { type: 'positive_wellbeing_marker', domain: 'wellbeing', signal_class: 'attitude', label: 'Population-level gratitude, efficacy, or meaning-making (distinct from calm_confidence)', defaultPolarity: 'positive', mirror: 'population_survey_finding' },
  // Preparedness & Protective Capacity
  { type: 'preparedness_drill_conducted', domain: 'preparedness', signal_class: 'event', label: 'Municipality or community conducted shelter/emergency drill or exercise', defaultPolarity: 'positive' },
  { type: 'preparedness_gap_identified', domain: 'preparedness', signal_class: 'structural_state', label: 'Documented gap in preparedness (missing shelters, untrained teams, no plan)', defaultPolarity: 'negative' },
  { type: 'early_warning_system_failure', domain: 'preparedness', signal_class: 'structural_state', label: 'Siren, alert app, or HFC early-warning system failed or arrived too late for protective action', defaultPolarity: 'negative', mirror: 'early_warning_system_effective',
    disambiguation: {
      not_confused_with: ['information_confusion', 'preparedness_gap_identified'],
      accept_patterns: ['sirens sounded only after impacts were reported in the community'],
    },
    example_evidence: ['Residents report Red Alert app notifications arrived after explosions in Netivot'],
  },
  { type: 'early_warning_system_effective', domain: 'preparedness', signal_class: 'structural_state', label: 'Early-warning system delivered timely alerts enabling protective action before harm', defaultPolarity: 'positive', mirror: 'early_warning_system_failure',
    example_evidence: ['Iron Dome intercept followed by sirens that gave residents time to reach mamad'],
  },
  { type: 'protective_infrastructure_present', domain: 'preparedness', signal_class: 'capacity', label: 'Protective infrastructure exists and is functional (mamad, shelters, safe rooms)', defaultPolarity: 'positive' },
  { type: 'protective_infrastructure_absent', domain: 'preparedness', signal_class: 'capacity', label: 'Protective infrastructure missing or non-functional for households/institutions', defaultPolarity: 'negative' },
  { type: 'household_readiness_demonstrated', domain: 'preparedness', signal_class: 'capacity', label: 'Households demonstrate emergency readiness (stocked kits, practiced plans)', defaultPolarity: 'positive' },
  { type: 'household_readiness_gap', domain: 'preparedness', signal_class: 'capacity', label: 'Households lack basic emergency readiness (no mamad, no supplies, no plan)', defaultPolarity: 'negative' },
  { type: 'plan_tested_during_event', domain: 'preparedness', signal_class: 'event', label: 'Emergency plan visibly tested and worked during the event', defaultPolarity: 'positive', mirror: 'plan_failed_during_event' },
  { type: 'plan_failed_during_event', domain: 'preparedness', signal_class: 'event', label: 'Emergency plan failed when tested during the event', defaultPolarity: 'negative', mirror: 'plan_tested_during_event' },
  { type: 'responder_workforce_strain', domain: 'preparedness', signal_class: 'structural_state', label: 'First-responder or municipal emergency workforce exhaustion documented', defaultPolarity: 'negative' },
  // Adaptation & Learning
  { type: 'adaptive_practice', domain: 'adaptation', signal_class: 'behavior', label: 'Community visibly changes routines to cope (rooftop schools, distributed offices, reordered work week)', defaultPolarity: 'positive' },
  { type: 'lessons_learned_uptake', domain: 'adaptation', signal_class: 'structural_state', label: 'Authorities or communities act on lessons from prior events (revised protocols, faster sirens)', defaultPolarity: 'positive' },
  { type: 'complacency_or_normalization', domain: 'adaptation', signal_class: 'attitude', label: 'Alert fatigue or risk habituation — sirens/risks treated as background (distinct from defiant non_compliance)', defaultPolarity: 'negative', scoringPriors: {"expected_phases":["response","recovery"],"time_horizon":"cumulative","phase_mismatch_discount":0.85,"temporal_half_life_days":14} },
  { type: 'innovation_under_constraint', domain: 'adaptation', signal_class: 'behavior', label: 'Community invents new method on the fly beyond routine adaptation', defaultPolarity: 'positive', mirror: 'adaptive_practice' },
  { type: 'failure_to_adapt', domain: 'adaptation', signal_class: 'structural_state', label: 'Community or authority sticks with failing approach despite visible evidence', defaultPolarity: 'negative', mirror: 'adaptive_practice' },
  { type: 'cross_event_learning', domain: 'adaptation', signal_class: 'structural_state', label: 'Explicit application of lessons from a prior emergency round', defaultPolarity: 'positive', mirror: 'lessons_learned_uptake' },
  // Children & Education
  { type: 'educational_continuity', domain: 'education', signal_class: 'structural_state', label: 'Schools or childcare operate (in-person or protected remote) during emergency', defaultPolarity: 'positive' },
  { type: 'educational_disruption', domain: 'education', signal_class: 'structural_state', label: 'Schools, kindergartens, or youth programs closed or severely disrupted', defaultPolarity: 'negative' },
  { type: 'learning_loss_documented', domain: 'education', signal_class: 'structural_state', label: 'Documented learning loss from school disruption', defaultPolarity: 'negative', mirror: 'educational_continuity' },
  { type: 'school_psychosocial_support_active', domain: 'education', signal_class: 'structural_state', label: 'Schools provide active psychosocial support during emergency', defaultPolarity: 'positive', mirror: 'school_psychosocial_support_gap' },
  { type: 'school_psychosocial_support_gap', domain: 'education', signal_class: 'structural_state', label: 'Schools lack psychosocial support for students during emergency', defaultPolarity: 'negative', mirror: 'school_psychosocial_support_active' },
  { type: 'educational_equity_gap', domain: 'education', signal_class: 'structural_state', label: 'School disruption disproportionately affects peripheral or minority student populations', defaultPolarity: 'negative' },
  // Trust & Legitimacy
  { type: 'interpersonal_trust', domain: 'trust', signal_class: 'attitude', label: 'Residents trust each other in the emergency (use polarity_override when evidence shows erosion)', defaultPolarity: 'positive' },
  { type: 'institutional_trust', domain: 'trust', signal_class: 'attitude', label: 'Residents trust named institutions in the emergency (use polarity_override when evidence shows erosion)', defaultPolarity: 'positive' },
  { type: 'media_trust', domain: 'trust', signal_class: 'attitude', label: 'Residents trust media sources for emergency information (use polarity_override when evidence shows erosion)', defaultPolarity: 'positive' },
  { type: 'inter_group_trust', domain: 'trust', signal_class: 'attitude', label: 'Trust across community groups in the emergency (use polarity_override when evidence shows erosion)', defaultPolarity: 'positive' },
  // Memory & Commemoration
  { type: 'commemoration_event_observed', domain: 'memory', signal_class: 'event', label: 'Memorial, commemoration, or remembrance event takes place during emergency', defaultPolarity: 'positive' },
  { type: 'memorialization_conflict', domain: 'memory', signal_class: 'structural_state', label: 'Conflict over how or whether to commemorate during the emergency', defaultPolarity: 'negative' },
  { type: 'anniversary_distress_uptick', domain: 'memory', signal_class: 'attitude', label: 'Distress increases around anniversary or memorial date', defaultPolarity: 'negative' },
  // Diaspora & Outside-In Support
  { type: 'diaspora_solidarity', domain: 'diaspora', signal_class: 'structural_state', label: 'Diaspora communities mobilize support for affected area', defaultPolarity: 'positive' },
  { type: 'international_aid_arrival', domain: 'diaspora', signal_class: 'structural_state', label: 'International aid or volunteers arrive to support the community', defaultPolarity: 'positive', mirror: 'international_aid_withdrawal' },
  { type: 'international_aid_withdrawal', domain: 'diaspora', signal_class: 'structural_state', label: 'International aid withdraws or fails to materialize when needed', defaultPolarity: 'negative', mirror: 'international_aid_arrival' },
  // Environmental & Agricultural Impact
  { type: 'environmental_damage_acute', domain: 'environmental', signal_class: 'event', label: 'Acute environmental damage from rockets, fires, or military activity', defaultPolarity: 'negative', scoringPriors: { expected_phases: ['response', 'recovery'], temporal_half_life_days: 30 } },
  { type: 'agricultural_damage', domain: 'environmental', signal_class: 'structural_state', label: 'Agricultural land, crops, or livestock damaged by the emergency', defaultPolarity: 'negative' },
  { type: 'ecosystem_stress', domain: 'environmental', signal_class: 'structural_state', label: 'Broader ecosystem stress documented (pollution, habitat, long-term land damage)', defaultPolarity: 'negative' },
  // Hostage & Captivity
  { type: 'hostage_family_advocacy', domain: 'hostage', signal_class: 'behavior', label: 'Hostage families organize advocacy or public pressure (documented activity)', defaultPolarity: 'positive' },
  { type: 'hostage_return_event', domain: 'hostage', signal_class: 'event', label: 'Hostage or captive returns home (documented event)', defaultPolarity: 'positive', scoringPriors: { expected_phases: ['response', 'recovery'], temporal_half_life_days: 30 } },
  { type: 'hostage_uncertainty_distress', domain: 'hostage', signal_class: 'attitude', label: 'Distress from ongoing hostage uncertainty in the community', defaultPolarity: 'negative', scoringPriors: {"expected_phases":["response","recovery"],"time_horizon":"cumulative","temporal_half_life_days":21} },
  // Cyber & Digital Infrastructure
  { type: 'cyber_attack_on_infrastructure', domain: 'cyber', signal_class: 'event', label: 'Cyber attack disrupts emergency infrastructure (hotlines, municipal systems)', defaultPolarity: 'negative' },
  { type: 'scam_wave_during_emergency', domain: 'cyber', signal_class: 'structural_state', label: 'Fraud or scam wave targets residents during the emergency', defaultPolarity: 'negative' },
  { type: 'deepfake_misinformation', domain: 'cyber', signal_class: 'structural_state', label: 'AI-generated or deepfake content spreads as emergency misinformation', defaultPolarity: 'negative', mirror: 'hostile_influence_operation' },
];

export const SIGNAL_TYPES = SIGNAL_CATALOG.map((s) => s.type);

const CATALOG_BY_TYPE = Object.fromEntries(SIGNAL_CATALOG.map((s) => [s.type, s]));

export function getSignalCatalogEntry(type) {
  return CATALOG_BY_TYPE[type] ?? null;
}

/** @param {string} type */
export function getScoringPriors(type) {
  const entry = getSignalCatalogEntry(type);
  if (!entry) return { ...DEFAULT_SCORING_PRIORS };
  return { ...DEFAULT_SCORING_PRIORS, ...(entry.scoringPriors ?? {}) };
}

export const SIGNAL_TO_COMPONENTS = {
  accountability_demand_constructive: { leadership: +0.7, information_communication: +0.3 },
  active_information_seeking: { information_communication: +0.7 },
  adaptive_practice: { functional_continuity: +0.8, community_capital: +0.5, narrative: +0.2 },
  agricultural_damage: { functional_continuity: -0.6, community_capital: -0.3 },
  anniversary_distress_uptick: { wellbeing_at_risk: -0.7, narrative: -0.3 },
  blame_narrative: { narrative: -0.8, leadership: -0.3, belonging_solidarity: -0.3 },
  blame_shifting: { leadership: -0.9, narrative: -0.3 },
  bridging_capital_demonstrated: { belonging_solidarity: +0.9, community_capital: +0.5 },
  bridging_capital_failure: { belonging_solidarity: -0.9, community_capital: -0.4 },
  calm_confidence: { narrative: +0.9, wellbeing_at_risk: +0.5 },
  child_distress: { wellbeing_at_risk: -0.9, belonging_solidarity: -0.2 },
  civic_engagement_constructive: { leadership: +0.8, community_capital: +0.4 },
  civil_society_mobilization: { leadership: +0.5, community_capital: +0.9 },
  commemoration_event_observed: { narrative: +0.5, belonging_solidarity: +0.6 },
  community_volunteering: { community_capital: +1, belonging_solidarity: +0.7, wellbeing_at_risk: +0.5 },
  compensation_blocked: { functional_continuity: -0.7, wellbeing_at_risk: -0.5, leadership: -0.3 },
  compensation_received: { functional_continuity: +0.7, wellbeing_at_risk: +0.4 },
  complacency_or_normalization: { lifesaving_behavior: -0.7, information_communication: -0.4, narrative: -0.3 },
  compliance_enter_shelter: { lifesaving_behavior: +1, leadership: +0.2, belonging_solidarity: +0.2 },
  compliance_follow_instructions: { lifesaving_behavior: +0.9, leadership: +0.3 },
  compliance_norm_enforcement: { lifesaving_behavior: +0.7, belonging_solidarity: +0.5, community_capital: +0.4 },
  compliance_partial: { lifesaving_behavior: +0.6, leadership: +0.2 },
  conflict_or_tension: { belonging_solidarity: -1.1, wellbeing_at_risk: -0.4 },
  conflict_resolution: { community_capital: +0.6, belonging_solidarity: +0.6, leadership: +0.3 },
  consensus_on_priorities: { leadership: +0.5, community_capital: +0.6, narrative: +0.2 },
  coordination_failure: { leadership: -1, community_capital: -0.6, functional_continuity: -0.5 },
  coordination_success: { leadership: +1, community_capital: +0.6, functional_continuity: +0.4 },
  cross_event_learning: { functional_continuity: +0.6, leadership: +0.5, lifesaving_behavior: +0.4 },
  cultural_continuity: { narrative: +0.6, belonging_solidarity: +0.6, functional_continuity: +0.4 },
  cyber_attack_on_infrastructure: { information_communication: -0.9, functional_continuity: -0.6 },
  deepfake_misinformation: { information_communication: -1, narrative: -0.4, leadership: -0.3 },
  connectivity_outage: { functional_continuity: -0.9, information_communication: -0.7, wellbeing_at_risk: -0.3 },
  early_warning_system_effective: { lifesaving_behavior: +0.9, information_communication: +0.5, leadership: +0.3 },
  early_warning_system_failure: { lifesaving_behavior: -1, information_communication: -0.6, leadership: -0.4 },
  institutional_abandonment_perception: { narrative: -0.9, leadership: -0.5, belonging_solidarity: -0.4 },
  population_survey_finding: { wellbeing_at_risk: -0.8, narrative: -0.3, information_communication: +0.2 },
  self_evacuation_unauthorized: { functional_continuity: -0.7, wellbeing_at_risk: -0.4, belonging_solidarity: -0.3 },
  delayed_mobilization: { functional_continuity: -0.6, community_capital: -0.5, leadership: -0.4 },
  delegation_empowerment: { leadership: +0.7, community_capital: +0.5, functional_continuity: +0.3 },
  dependency_on_external_aid: { community_capital: -0.5, functional_continuity: -0.3 },
  diaspora_solidarity: { community_capital: +0.7, belonging_solidarity: +0.5, narrative: +0.3 },
  digital_mutual_aid: { community_capital: +0.8, belonging_solidarity: +0.5 },
  displacement_resolved: { functional_continuity: +0.9, wellbeing_at_risk: +0.5, belonging_solidarity: +0.3 },
  dissensus_blocks_action: { leadership: -0.6, community_capital: -0.7, narrative: -0.3 },
  domestic_violence_indicator: { wellbeing_at_risk: -0.9, belonging_solidarity: -0.4 },
  economic_continuity: { functional_continuity: +0.8, wellbeing_at_risk: +0.4 },
  economic_disruption: { functional_continuity: -0.8, wellbeing_at_risk: -0.4 },
  ecosystem_stress: { functional_continuity: -0.4, wellbeing_at_risk: -0.2 },
  educational_continuity: { functional_continuity: +0.9, wellbeing_at_risk: +0.4 },
  educational_disruption: { functional_continuity: -1, wellbeing_at_risk: -0.5 },
  educational_equity_gap: { wellbeing_at_risk: -0.7, belonging_solidarity: -0.4, functional_continuity: -0.4 },
  environmental_damage_acute: { functional_continuity: -0.7, wellbeing_at_risk: -0.3 },
  equitable_resource_distribution: { wellbeing_at_risk: +0.3, community_capital: +0.4, belonging_solidarity: +0.4 },
  evacuation_displacement: { functional_continuity: -1, wellbeing_at_risk: -0.6, belonging_solidarity: -0.3 },
  failure_to_adapt: { functional_continuity: -0.7, leadership: -0.4, community_capital: -0.3 },
  fear_expression: { wellbeing_at_risk: -0.7, narrative: -0.3 },
  feedback_channel_blocked: { information_communication: -0.7, leadership: -0.4, community_capital: -0.3 },
  feedback_channel_open: { information_communication: +0.7, leadership: +0.4, community_capital: +0.3 },
  feedback_loop_closure: { leadership: +0.7, information_communication: +0.5 },
  food_security_maintained: { functional_continuity: +0.7, wellbeing_at_risk: +0.4 },
  food_security_stress: { functional_continuity: -0.8, wellbeing_at_risk: -0.6 },
  future_orientation_despair: { narrative: -0.7, wellbeing_at_risk: -0.5 },
  future_orientation_hope: { narrative: +0.7, wellbeing_at_risk: +0.4 },
  harm_to_population: { wellbeing_at_risk: -1.2, narrative: -0.4, leadership: -0.3, community_capital: -0.4 },
  help_seeking_behavior: { belonging_solidarity: +0.6, community_capital: +0.4, wellbeing_at_risk: +0.3 },
  heroism_overframing: { narrative: -0.5, leadership: -0.2 },
  historical_analogy_frame: { narrative: -0.4, wellbeing_at_risk: -0.3 },
  hostage_family_advocacy: { narrative: +0.5, leadership: +0.4, belonging_solidarity: +0.5, wellbeing_at_risk: +0.3 },
  hostage_return_event: { narrative: +0.6, wellbeing_at_risk: +0.5, belonging_solidarity: +0.4 },
  hostage_uncertainty_distress: { wellbeing_at_risk: -0.9, narrative: -0.5 },
  hostile_influence_operation: { information_communication: -1.1, narrative: -0.4, leadership: -0.3 },
  household_readiness_demonstrated: { lifesaving_behavior: +0.7, community_capital: +0.3 },
  household_readiness_gap: { lifesaving_behavior: -0.7, wellbeing_at_risk: -0.4 },
  household_strain_economic: { wellbeing_at_risk: -0.7, functional_continuity: -0.4 },
  inequitable_resource_access: { wellbeing_at_risk: -0.8, community_capital: -0.5, belonging_solidarity: -0.4 },
  informal_leadership_emergence: { leadership: +0.8, community_capital: +0.6 },
  information_actionable_effective: { information_communication: +1, lifesaving_behavior: +0.6 },
  information_clarity: { information_communication: +1, lifesaving_behavior: +0.4 },
  information_confusion: { information_communication: -1, leadership: -0.4, lifesaving_behavior: -0.3 },
  information_effectiveness_gap: { information_communication: -1, lifesaving_behavior: -0.5 },
  information_inclusivity_gap: { information_communication: -1, wellbeing_at_risk: -0.5, belonging_solidarity: -0.4 },
  information_inclusivity_present: { information_communication: +1, wellbeing_at_risk: +0.5 },
  information_overload: { information_communication: -0.8, wellbeing_at_risk: -0.3 },
  information_vacuum_post_event: { information_communication: -0.9, leadership: -0.3 },
  infrastructure_damage_acute: { functional_continuity: -1, wellbeing_at_risk: -0.4 },
  innovation_under_constraint: { functional_continuity: +0.7, community_capital: +0.6, narrative: +0.3 },
  institutional_trust: { leadership: +0.9, information_communication: +0.4 },
  inter_group_trust: { belonging_solidarity: +0.8, community_capital: +0.4, leadership: +0.3 },
  interfaith_solidarity: { belonging_solidarity: +0.9, community_capital: +0.4 },
  interfaith_tension: { belonging_solidarity: -0.9, wellbeing_at_risk: -0.3, community_capital: -0.3 },
  international_aid_arrival: { community_capital: +0.6, functional_continuity: +0.5 },
  international_aid_withdrawal: { community_capital: -0.5, functional_continuity: -0.4 },
  interpersonal_trust: { belonging_solidarity: +0.8, leadership: +0.4, information_communication: +0.3 },
  language_register_mismatch: { information_communication: -0.8, wellbeing_at_risk: -0.4, belonging_solidarity: -0.3 },
  leadership_absence: { leadership: -1.3, lifesaving_behavior: -0.4 },
  leadership_clear_guidance: { leadership: +1.1, lifesaving_behavior: +0.4 },
  leadership_credibility_loss: { leadership: -1.1, narrative: -0.3 },
  leadership_visible_presence: { leadership: +1 },
  learning_loss_documented: { functional_continuity: -0.6, wellbeing_at_risk: -0.5 },
  lessons_learned_uptake: { functional_continuity: +0.6, leadership: +0.5, lifesaving_behavior: +0.3 },
  local_capacity_demonstrated: { community_capital: +0.9, functional_continuity: +0.4 },
  media_literacy_demonstrated: { information_communication: +0.6, community_capital: +0.5 },
  media_trust: { information_communication: +0.8, narrative: +0.3, leadership: +0.3 },
  memorialization_conflict: { belonging_solidarity: -0.7, narrative: -0.4 },
  meta_information_gap: { information_communication: -0.7, leadership: -0.3 },
  meta_information_present: { information_communication: +0.7, leadership: +0.3 },
  mistrusted_information_source: { information_communication: -0.9, leadership: -0.4, narrative: -0.3 },
  moral_injury_narrative: { narrative: -0.8, wellbeing_at_risk: -0.6 },
  near_miss_reported: { lifesaving_behavior: -0.6, narrative: -0.3, wellbeing_at_risk: -0.5 },
  news_avoidance_behavior: { information_communication: -0.6, lifesaving_behavior: -0.3 },
  non_compliance_due_to_distrust: { lifesaving_behavior: -0.9, information_communication: -0.5, leadership: -0.4 },
  non_compliance_exit_early: { lifesaving_behavior: -1.2 },
  non_compliance_ignore_guidelines: { lifesaving_behavior: -1, leadership: -0.3 },
  panic_behavior: { lifesaving_behavior: -0.7, wellbeing_at_risk: -0.8 },
  parental_burden: { wellbeing_at_risk: -0.7, functional_continuity: -0.3 },
  plan_failed_during_event: { lifesaving_behavior: -0.8, leadership: -0.5 },
  plan_tested_during_event: { lifesaving_behavior: +0.7, leadership: +0.4 },
  political_distrust: { leadership: -1, narrative: -0.4, information_communication: -0.3 },
  positive_wellbeing_marker: { wellbeing_at_risk: +0.6, narrative: +0.4 },
  post_event_recovery_indicator: { functional_continuity: +0.7, community_capital: +0.4, narrative: +0.4 },
  preparedness_drill_conducted: { lifesaving_behavior: +0.8, leadership: +0.5, community_capital: +0.4 },
  preparedness_gap_identified: { lifesaving_behavior: -0.8, leadership: -0.5 },
  prosocial_norm_violation: { belonging_solidarity: -0.7, community_capital: -0.5 },
  protection_effective: { lifesaving_behavior: +1, narrative: +0.3, leadership: +0.3 },
  protective_infrastructure_absent: { lifesaving_behavior: -0.9, wellbeing_at_risk: -0.5 },
  protective_infrastructure_present: { lifesaving_behavior: +0.9, functional_continuity: +0.5 },
  psychological_distress: { wellbeing_at_risk: -1 },
  rapid_mobilization: { functional_continuity: +0.6, community_capital: +0.6, leadership: +0.4 },
  recovery_setback: { functional_continuity: -0.9, narrative: -0.3, community_capital: -0.3 },
  religious_coping_practice: { belonging_solidarity: +0.7, narrative: +0.5, wellbeing_at_risk: +0.5 },
  reservist_family_strain: { wellbeing_at_risk: -0.8, community_capital: -0.3, belonging_solidarity: -0.2 },
  resilience_narrative_negative: { narrative: -1 },
  resilience_narrative_positive: { narrative: +1 },
  resource_allocation_opacity: { community_capital: -0.7, leadership: -0.4, wellbeing_at_risk: -0.4 },
  resource_allocation_transparency: { community_capital: +0.7, leadership: +0.4, wellbeing_at_risk: +0.3 },
  resource_mobilization: { community_capital: +1, wellbeing_at_risk: +0.6 },
  resource_shortage: { community_capital: -1, wellbeing_at_risk: -0.8, functional_continuity: -0.5 },
  responder_workforce_strain: { lifesaving_behavior: -0.6, leadership: -0.5, functional_continuity: -0.4 },
  responsibility_avowal: { leadership: +0.8, narrative: +0.3 },
  risk_exposure_behavior: { lifesaving_behavior: -1 },
  risk_trade_off_behavior: { lifesaving_behavior: -0.5, wellbeing_at_risk: -0.4 },
  routine_disruption: { functional_continuity: -0.7, wellbeing_at_risk: -0.3 },
  routine_maintenance: { functional_continuity: +0.9, narrative: +0.2 },
  rumor_correction: { information_communication: +1, narrative: +0.4 },
  rumor_spread: { information_communication: -1.2, narrative: -0.5 },
  scam_wave_during_emergency: { information_communication: -0.6, wellbeing_at_risk: -0.5 },
  school_psychosocial_support_active: { wellbeing_at_risk: +0.6, functional_continuity: +0.4 },
  school_psychosocial_support_gap: { wellbeing_at_risk: -0.6, functional_continuity: -0.3 },
  self_organization: { community_capital: +0.9, belonging_solidarity: +0.6 },
  service_continuity: { functional_continuity: +1 },
  service_disruption: { functional_continuity: -1.5, wellbeing_at_risk: -0.4 },
  sleep_disruption_population: { wellbeing_at_risk: -0.7 },
  social_isolation: { belonging_solidarity: -1, wellbeing_at_risk: -0.8 },
  solidarity_help_others: { belonging_solidarity: +1, wellbeing_at_risk: +0.7, community_capital: +0.6, narrative: +0.3 },
  substance_use_uptick: { wellbeing_at_risk: -0.6 },
  suicide_self_harm_indicator: { wellbeing_at_risk: -1, narrative: -0.3 },
  supply_chain_disruption: { functional_continuity: -0.9, community_capital: -0.4 },
  symbolic_vs_substantive_action: { leadership: -0.7, narrative: -0.2 },
  system_overload: { functional_continuity: -1, wellbeing_at_risk: -0.6 },
  system_resilience_under_load: { functional_continuity: +1, wellbeing_at_risk: +0.4 },
  trusted_information_source: { information_communication: +0.9, leadership: +0.4, narrative: +0.3 },
  unsafe_gathering: { lifesaving_behavior: -0.9 },
  volunteer_donor_fatigue: { community_capital: -0.7 },
  wellbeing_support_accessed: { wellbeing_at_risk: +0.7, community_capital: +0.4, belonging_solidarity: +0.3 },
  workplace_flexibility_response: { functional_continuity: +0.6, wellbeing_at_risk: +0.5 },
};

/**
 * Assert catalog ↔ mapping coherence (for tests).
 * @returns {string[]} warning messages
 */
export function assertCatalogPolarityCoherence() {
  const warnings = [];
  const intensityLevels = new Set(['light', 'moderate', 'severe']);
  for (const entry of SIGNAL_CATALOG) {
    const mapping = SIGNAL_TO_COMPONENTS[entry.type];
    if (!mapping) {
      warnings.push(`missing mapping for ${entry.type}`);
      continue;
    }
    const hasPositive = Object.values(mapping).some((w) => w > 0);
    const hasNegative = Object.values(mapping).some((w) => w < 0);
    if (entry.defaultPolarity === 'positive' && !hasPositive) {
      warnings.push(`${entry.type}: defaultPolarity positive but no positive weight`);
    }
    if (entry.defaultPolarity === 'negative' && !hasNegative) {
      warnings.push(`${entry.type}: defaultPolarity negative but no negative weight`);
    }
    if (entry.mirror && !CATALOG_BY_TYPE[entry.mirror]) {
      warnings.push(`${entry.type}: mirror target missing: ${entry.mirror}`);
    }
    if (entry.scoringPriors?.allowed_intensities) {
      for (const lvl of entry.scoringPriors.allowed_intensities) {
        if (!intensityLevels.has(lvl)) {
          warnings.push(`${entry.type}: invalid allowed_intensity ${lvl}`);
        }
      }
    }
  }
  for (const type of Object.keys(SIGNAL_TO_COMPONENTS)) {
    if (!CATALOG_BY_TYPE[type]) warnings.push(`orphan mapping for ${type}`);
  }
  return warnings;
}
