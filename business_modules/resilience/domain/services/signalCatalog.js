/**
 * Closed-vocabulary signal catalog and component routing (v4).
 */

export const SIGNAL_DOMAINS = {
  compliance:    'Compliance & Discipline',
  risk:          'Risk & Safety',
  social:        'Social Cohesion',
  leadership:    'Leadership & Governance',
  information:   'Information & Communication',
  continuity:    'Functional Continuity',
  narrative:     'Emotional / Narrative',
  resources:     'Community Resources',
  wellbeing:     'Population Wellbeing',
  preparedness:  'Preparedness & Protective Capacity',
  adaptation:    'Adaptation & Learning',
  education:     'Children & Education',
};

/** @typedef {'behavior'|'attitude'|'structural_state'|'narrative'} SignalClass */

/**
 * All valid signal types the LLM may emit.
 * @type {Array<{ type: string, domain: string, label: string, defaultPolarity: 'positive'|'negative', signal_class: SignalClass }>}
 */
export const SIGNAL_CATALOG = [
  // A. Compliance & Discipline
  { type: 'compliance_enter_shelter',         domain: 'compliance',  signal_class: 'behavior',          label: 'Residents enter shelter when alerted',           defaultPolarity: 'positive' },
  { type: 'compliance_follow_instructions',   domain: 'compliance',  signal_class: 'behavior',          label: 'Residents follow official protective instructions', defaultPolarity: 'positive' },
  { type: 'non_compliance_exit_early',        domain: 'compliance',  signal_class: 'behavior',          label: 'Residents leave shelter before all-clear',         defaultPolarity: 'negative' },
  { type: 'non_compliance_ignore_guidelines', domain: 'compliance',  signal_class: 'behavior',          label: 'Residents ignore or dismiss safety guidelines',     defaultPolarity: 'negative' },

  // B. Risk & Safety
  { type: 'risk_exposure_behavior',           domain: 'risk',        signal_class: 'behavior',          label: 'Residents expose themselves to risk (filming, staying outside)', defaultPolarity: 'negative' },
  { type: 'panic_behavior',                   domain: 'risk',        signal_class: 'behavior',          label: 'Chaotic or unsafe reactions during alerts',        defaultPolarity: 'negative' },
  { type: 'unsafe_gathering',                 domain: 'risk',        signal_class: 'behavior',          label: 'Gatherings that violate safety guidelines',        defaultPolarity: 'negative' },
  { type: 'protection_effective',             domain: 'risk',        signal_class: 'structural_state',  label: 'A defensive measure demonstrably averted harm (Iron Dome interception, mamad/shelter doctrine, drill saved lives in documented hit)', defaultPolarity: 'positive' },

  // C. Social Cohesion
  { type: 'solidarity_help_others',           domain: 'social',      signal_class: 'behavior',          label: 'Residents help neighbors, strangers, or community members', defaultPolarity: 'positive' },
  { type: 'community_volunteering',           domain: 'social',      signal_class: 'behavior',          label: 'Organized or spontaneous volunteering',            defaultPolarity: 'positive' },
  { type: 'social_isolation',                 domain: 'social',      signal_class: 'behavior',          label: 'Residents withdraw, are isolated, or excluded',    defaultPolarity: 'negative' },
  { type: 'conflict_or_tension',              domain: 'social',      signal_class: 'behavior',          label: 'Reported conflicts, scapegoating, or inter-group tension', defaultPolarity: 'negative' },
  { type: 'conflict_resolution',              domain: 'social',      signal_class: 'behavior',          label: 'Community actors resolve conflicts constructively, enabling cooperation (mediation, compromise, de-escalation)', defaultPolarity: 'positive' },
  { type: 'religious_coping_practice',        domain: 'social',      signal_class: 'behavior',          label: 'Faith-based communal coping (prayer assemblies, tehillim groups, ritualized mourning)', defaultPolarity: 'positive' },
  { type: 'interfaith_solidarity',            domain: 'social',      signal_class: 'behavior',          label: 'Constructive cooperation across religious lines during the emergency', defaultPolarity: 'positive' },
  { type: 'interfaith_tension',               domain: 'social',      signal_class: 'behavior',          label: 'Conflict or tension specifically along religious lines', defaultPolarity: 'negative' },

  // D. Leadership & Governance
  { type: 'leadership_visible_presence',      domain: 'leadership',  signal_class: 'structural_state',  label: 'Leadership is publicly visible and active',        defaultPolarity: 'positive' },
  { type: 'leadership_clear_guidance',        domain: 'leadership',  signal_class: 'structural_state',  label: 'Leadership provides clear, specific directions',   defaultPolarity: 'positive' },
  { type: 'leadership_absence',               domain: 'leadership',  signal_class: 'structural_state',  label: 'Leadership is absent, unavailable, or unresponsive', defaultPolarity: 'negative' },
  { type: 'leadership_credibility_loss',      domain: 'leadership',  signal_class: 'attitude',          label: 'Residents or affected groups voice concrete loss of trust in named leadership (broken promises, false reassurances, perceived dishonesty about emergency conditions)', defaultPolarity: 'negative' },
  { type: 'political_distrust',               domain: 'leadership',  signal_class: 'attitude',          label: 'Residents or named civic figures publicly demand accountability or express distrust of the political/governmental handling of the emergency (specific policy demands, not general partisan opinion)', defaultPolarity: 'negative' },
  { type: 'consensus_on_priorities',          domain: 'leadership',  signal_class: 'structural_state',  label: 'Community actors reach working consensus on goals/priorities and a plan for action (collaboration, agreement on what to do next)', defaultPolarity: 'positive' },
  { type: 'dissensus_blocks_action',          domain: 'leadership',  signal_class: 'structural_state',  label: 'Mistrust/conflict prevents working consensus or blocks collective action (dissensus, infighting, inability to agree on priorities)', defaultPolarity: 'negative' },
  { type: 'coordination_failure',             domain: 'leadership',  signal_class: 'structural_state',  label: 'Inter-agency or inter-organization coordination breaks down', defaultPolarity: 'negative' },
  { type: 'coordination_success',             domain: 'leadership',  signal_class: 'structural_state',  label: 'Multiple agencies, services, or organizations coordinate effectively in response', defaultPolarity: 'positive' },
  { type: 'feedback_loop_closure',            domain: 'leadership',  signal_class: 'structural_state',  label: 'Authorities visibly act on community input, complaints, or requests', defaultPolarity: 'positive' },
  { type: 'civic_engagement_constructive',    domain: 'leadership',  signal_class: 'behavior',          label: 'Constructive civic participation (public hearings, lawful protest with concrete demands, organized petitioning)', defaultPolarity: 'positive' },
  { type: 'civil_society_mobilization',       domain: 'leadership',  signal_class: 'structural_state',  label: 'NGOs or civil-society organizations step up with organized non-state response', defaultPolarity: 'positive' },
  { type: 'accountability_demand_constructive', domain: 'leadership', signal_class: 'behavior',         label: 'Public requests for explanations that are answered or visibly addressed (distinct from unanswered political_distrust)', defaultPolarity: 'positive' },

  // E. Information & Communication
  { type: 'information_clarity',              domain: 'information', signal_class: 'structural_state',  label: 'Residents report receiving clear, useful information', defaultPolarity: 'positive' },
  { type: 'information_confusion',            domain: 'information', signal_class: 'structural_state',  label: 'Residents report confusion, contradictory, or missing information', defaultPolarity: 'negative' },
  { type: 'rumor_spread',                     domain: 'information', signal_class: 'structural_state',  label: 'Rumors or misinformation are circulating',          defaultPolarity: 'negative' },
  { type: 'rumor_correction',                 domain: 'information', signal_class: 'structural_state',  label: 'Authorities, experts, or community members visibly correct circulating rumors or misinformation', defaultPolarity: 'positive' },
  { type: 'trusted_information_source',       domain: 'information', signal_class: 'structural_state',  label: 'Residents rely on or explicitly trust a specific local/official source for emergency information (trusted hotline, known local authority, trusted broadcaster)', defaultPolarity: 'positive' },
  { type: 'mistrusted_information_source',    domain: 'information', signal_class: 'structural_state',  label: 'Residents explicitly distrust or disregard an emergency information source (source seen as unreliable/lying/ignored), reducing adherence', defaultPolarity: 'negative' },
  { type: 'feedback_channel_open',            domain: 'information', signal_class: 'structural_state',  label: 'A working channel exists for the public to ask questions / articulate needs and receive responses (hotline, municipal desk, two-way messaging)', defaultPolarity: 'positive' },
  { type: 'feedback_channel_blocked',         domain: 'information', signal_class: 'structural_state',  label: 'Public feedback/inquiry channels are absent, unreachable, or ignored (hotline down, no response, no way to ask/clarify)', defaultPolarity: 'negative' },
  { type: 'active_information_seeking',       domain: 'information', signal_class: 'behavior',          label: 'Residents actively seek out emergency or protective guidance — shelter locations, HFC instructions, evacuation routes, operational alerts. NOT: legal, financial, religious, or personal planning information.',  defaultPolarity: 'positive' },
  { type: 'information_actionable_effective', domain: 'information', signal_class: 'structural_state',  label: 'Guidance is specific, situation-matched, and demonstrably leads to correct protective behavior', defaultPolarity: 'positive' },
  { type: 'information_effectiveness_gap',    domain: 'information', signal_class: 'structural_state',  label: 'Guidance exists but fails to help — does not match real constraints, too vague to act on, or leaves critical scenarios uncovered', defaultPolarity: 'negative' },
  { type: 'information_inclusivity_present',  domain: 'information', signal_class: 'structural_state',  label: 'Emergency information adapted for at-risk groups (Arabic translations, accessible formats, elder outreach, special-needs channels)', defaultPolarity: 'positive' },
  { type: 'information_inclusivity_gap',      domain: 'information', signal_class: 'structural_state',  label: 'Emergency information not reaching at-risk groups (no Arabic, inaccessible formats, elders/disabled left uninformed)', defaultPolarity: 'negative' },
  { type: 'hostile_influence_operation',      domain: 'information', signal_class: 'structural_state',  label: 'Identified foreign or coordinated disinformation push (state actors, bot networks) — distinct from organic rumor_spread', defaultPolarity: 'negative' },
  { type: 'news_avoidance_behavior',          domain: 'information', signal_class: 'behavior',          label: 'Residents intentionally tune out emergency news or alerts as coping', defaultPolarity: 'negative' },
  { type: 'media_literacy_demonstrated',      domain: 'information', signal_class: 'behavior',          label: 'Ordinary residents (not authorities) visibly correct misinformation or verify claims', defaultPolarity: 'positive' },

  // F. Functional Continuity
  { type: 'service_continuity',               domain: 'continuity',  signal_class: 'structural_state',  label: 'Essential services or institutions are operating',  defaultPolarity: 'positive' },
  { type: 'service_disruption',               domain: 'continuity',  signal_class: 'structural_state',  label: 'Essential services, schools, or businesses are closed/disrupted', defaultPolarity: 'negative' },
  { type: 'routine_maintenance',              domain: 'continuity',  signal_class: 'behavior',          label: 'Residents maintain normal daily routines',          defaultPolarity: 'positive' },
  { type: 'routine_disruption',               domain: 'continuity',  signal_class: 'structural_state',  label: 'Civilian daily routines (commuting, shopping, leisure, social rhythms) are visibly disrupted by the emergency — distinct from named-institution closures, which are service_disruption', defaultPolarity: 'negative' },
  { type: 'evacuation_displacement',          domain: 'continuity',  signal_class: 'structural_state',  label: 'Residents are evacuated, displaced, or unable to return home because of the emergency (named community, hotel/relative housing, prolonged absence)', defaultPolarity: 'negative' },
  { type: 'displacement_resolved',            domain: 'continuity',  signal_class: 'structural_state',  label: 'Evacuees return home or displacement is visibly resolved (mirror of evacuation_displacement)', defaultPolarity: 'positive' },
  { type: 'system_overload',                  domain: 'continuity',  signal_class: 'structural_state',  label: 'Systems (healthcare, emergency, infrastructure) are overwhelmed', defaultPolarity: 'negative' },
  { type: 'system_resilience_under_load',     domain: 'continuity',  signal_class: 'structural_state',  label: 'A named system continues operating effectively despite documented elevated demand or disruption', defaultPolarity: 'positive' },
  { type: 'economic_continuity',              domain: 'continuity',  signal_class: 'structural_state',  label: 'Local economic activity (employment, business, commerce) sustains during the emergency', defaultPolarity: 'positive' },
  { type: 'economic_disruption',              domain: 'continuity',  signal_class: 'structural_state',  label: 'Local economic activity is disrupted: business closures, lost income, employment freeze due to the emergency', defaultPolarity: 'negative' },
  { type: 'post_event_recovery_indicator',    domain: 'continuity',  signal_class: 'structural_state',  label: 'Communities visibly recover after a hit: re-opening, return of evacuees, resumed routines', defaultPolarity: 'positive' },
  { type: 'recovery_setback',                 domain: 'continuity',  signal_class: 'structural_state',  label: 'Recovery reverses: reopened services close again, repairs fail, evacuees cannot stay home', defaultPolarity: 'negative' },
  { type: 'compensation_received',            domain: 'continuity',  signal_class: 'structural_state',  label: 'Affected residents or businesses receive promised compensation (Property Tax Fund, pitsuim, grants)', defaultPolarity: 'positive' },
  { type: 'compensation_blocked',             domain: 'continuity',  signal_class: 'structural_state',  label: 'Promised compensation or aid payments are delayed, denied, or not reaching claimants', defaultPolarity: 'negative' },
  { type: 'cultural_continuity',              domain: 'continuity',  signal_class: 'narrative',         label: 'Identity-bearing rituals, ceremonies, holidays, or cultural events take place during the emergency', defaultPolarity: 'positive' },
  { type: 'rapid_mobilization',               domain: 'continuity',  signal_class: 'structural_state',  label: 'Resources/services are mobilized quickly to meet needs (rapid access, timely restoration, fast deployment)', defaultPolarity: 'positive' },
  { type: 'delayed_mobilization',             domain: 'continuity',  signal_class: 'structural_state',  label: 'Resources/services are mobilized too slowly, increasing disruption (slow response, delays in opening/repairing/deploying)', defaultPolarity: 'negative' },
  { type: 'adaptive_practice',                domain: 'adaptation',  signal_class: 'behavior',          label: 'Community visibly changes routines to cope (rooftop schools, distributed offices, reordered work week)', defaultPolarity: 'positive' },
  { type: 'lessons_learned_uptake',           domain: 'adaptation',  signal_class: 'structural_state',  label: 'Authorities or communities act on lessons from prior events (revised protocols, faster sirens)', defaultPolarity: 'positive' },
  { type: 'complacency_or_normalization',     domain: 'adaptation',  signal_class: 'attitude',          label: 'Alert fatigue or risk habituation — sirens/risks treated as background (distinct from defiant non_compliance)', defaultPolarity: 'negative' },

  // G. Emotional / Narrative
  { type: 'fear_expression',                  domain: 'narrative',   signal_class: 'attitude',          label: 'Residents express fear, anxiety, or trauma',       defaultPolarity: 'negative' },
  { type: 'calm_confidence',                  domain: 'narrative',   signal_class: 'attitude',          label: 'Residents express calm, confidence, or sense of control', defaultPolarity: 'positive' },
  { type: 'resilience_narrative_positive',    domain: 'narrative',   signal_class: 'narrative',         label: 'Residents describe the community as coping effectively', defaultPolarity: 'positive' },
  { type: 'resilience_narrative_negative',    domain: 'narrative',   signal_class: 'narrative',         label: 'Residents contradict or reject the official coping narrative', defaultPolarity: 'negative' },

  // H. Community Resources
  { type: 'resource_mobilization',            domain: 'resources',   signal_class: 'structural_state',  label: 'Community or authority mobilizes material/human resources', defaultPolarity: 'positive' },
  { type: 'resource_shortage',                domain: 'resources',   signal_class: 'structural_state',  label: 'Community reports shortage of resources, services, or support', defaultPolarity: 'negative' },
  { type: 'self_organization',                domain: 'resources',   signal_class: 'behavior',          label: 'Community organizes itself without external direction', defaultPolarity: 'positive' },
  { type: 'dependency_on_external_aid',       domain: 'resources',   signal_class: 'structural_state',  label: 'Community depends heavily on external aid due to local capacity gaps', defaultPolarity: 'negative' },
  { type: 'local_capacity_demonstrated',      domain: 'resources',   signal_class: 'structural_state',  label: 'Community demonstrates self-reliant capacity (own funds, own labour, own infrastructure) without leaning on outside aid', defaultPolarity: 'positive' },

  // I. Population Wellbeing
  { type: 'harm_to_population',              domain: 'wellbeing',   signal_class: 'structural_state',  label: 'Physical harm occurred in the community: casualties, injuries, civilians wounded or killed', defaultPolarity: 'negative' },
  { type: 'psychological_distress',          domain: 'wellbeing',   signal_class: 'attitude',          label: 'Named individual or survey reports accumulated trauma, PTSD, grief, or chronic sleep disruption — distinct from situational fear', defaultPolarity: 'negative' },
  { type: 'wellbeing_support_accessed',      domain: 'wellbeing',   signal_class: 'structural_state',  label: 'Individuals or groups access psychological support, trauma care, or community wellbeing programs', defaultPolarity: 'positive' },
  { type: 'inequitable_resource_access',     domain: 'wellbeing',   signal_class: 'structural_state',  label: 'Unequal access to safety/resources/services across subgroups (disparities, exclusion of vulnerable populations)', defaultPolarity: 'negative' },
  { type: 'equitable_resource_distribution', domain: 'wellbeing',   signal_class: 'structural_state',  label: 'Resources/support are distributed fairly based on needs (equity-aware allocation, non-disparate access)', defaultPolarity: 'positive' },
  { type: 'child_distress',                  domain: 'wellbeing',   signal_class: 'attitude',          label: 'Children-specific psychological distress (regression, separation anxiety, school refusal) — distinct from general psychological_distress', defaultPolarity: 'negative' },
  { type: 'parental_burden',                 domain: 'wellbeing',   signal_class: 'structural_state',  label: 'Parents bear childcare burden during sheltering or school closure', defaultPolarity: 'negative' },
  { type: 'reservist_family_strain',         domain: 'wellbeing',   signal_class: 'structural_state',  label: 'Household strain from long reserve deployment (single parent, lost wages, absence)', defaultPolarity: 'negative' },
  { type: 'household_strain_economic',       domain: 'wellbeing',   signal_class: 'structural_state',  label: 'Household cannot pay rent or faces wage loss — distinct from macro economic_disruption', defaultPolarity: 'negative' },

  // J. Preparedness
  { type: 'preparedness_drill_conducted',     domain: 'preparedness', signal_class: 'behavior',         label: 'Municipality or community conducted shelter/emergency drill or exercise', defaultPolarity: 'positive' },
  { type: 'preparedness_gap_identified',      domain: 'preparedness', signal_class: 'structural_state', label: 'Documented gap in preparedness (missing shelters, untrained teams, no plan)', defaultPolarity: 'negative' },
  { type: 'protective_infrastructure_present', domain: 'preparedness', signal_class: 'structural_state', label: 'Protective infrastructure exists and is functional (mamad, shelters, safe rooms)', defaultPolarity: 'positive' },
  { type: 'protective_infrastructure_absent', domain: 'preparedness', signal_class: 'structural_state', label: 'Protective infrastructure missing or non-functional for households/institutions', defaultPolarity: 'negative' },
  { type: 'household_readiness_demonstrated', domain: 'preparedness', signal_class: 'behavior',         label: 'Households demonstrate emergency readiness (stocked kits, practiced plans)', defaultPolarity: 'positive' },
  { type: 'household_readiness_gap',          domain: 'preparedness', signal_class: 'structural_state', label: 'Households lack basic emergency readiness (no mamad, no supplies, no plan)', defaultPolarity: 'negative' },

  // K. Education
  { type: 'educational_continuity',           domain: 'education',   signal_class: 'structural_state',  label: 'Schools or childcare operate (in-person or protected remote) during emergency', defaultPolarity: 'positive' },
  { type: 'educational_disruption',           domain: 'education',   signal_class: 'structural_state',  label: 'Schools, kindergartens, or youth programs closed or severely disrupted', defaultPolarity: 'negative' },
];

export const SIGNAL_TYPES = SIGNAL_CATALOG.map((s) => s.type);

const CATALOG_BY_TYPE = Object.fromEntries(SIGNAL_CATALOG.map((s) => [s.type, s]));

export function getSignalCatalogEntry(type) {
  return CATALOG_BY_TYPE[type] ?? null;
}

export const SIGNAL_TO_COMPONENTS = {
  // Compliance
  compliance_enter_shelter:          { lifesaving_behavior: +1.0, leadership: +0.2, belonging_solidarity: +0.2 },
  compliance_follow_instructions:    { lifesaving_behavior: +0.9 },
  non_compliance_exit_early:         { lifesaving_behavior: -1.2 },
  non_compliance_ignore_guidelines:  { lifesaving_behavior: -1.0 },

  // Risk
  risk_exposure_behavior:            { lifesaving_behavior: -1.0 },
  panic_behavior:                    { lifesaving_behavior: -0.7, wellbeing_atrisk: -0.8 },
  unsafe_gathering:                  { lifesaving_behavior: -0.9 },
  protection_effective:              { lifesaving_behavior: +1.0, narrative: +0.5, leadership: +0.3 },

  // Social
  solidarity_help_others:            { belonging_solidarity: +1.0, wellbeing_atrisk: +0.7, community_capital: +0.6, narrative: +0.3 },
  community_volunteering:            { community_capital: +1.0, belonging_solidarity: +0.7, wellbeing_atrisk: +0.5 },
  social_isolation:                  { belonging_solidarity: -1.0, wellbeing_atrisk: -0.8 },
  conflict_or_tension:               { belonging_solidarity: -1.1, wellbeing_atrisk: -0.4 },
  conflict_resolution:               { community_capital: +0.6, belonging_solidarity: +0.6, leadership: +0.3 },
  religious_coping_practice:         { belonging_solidarity: +0.7, narrative: +0.5, wellbeing_atrisk: +0.3 },
  interfaith_solidarity:             { belonging_solidarity: +0.9, community_capital: +0.4 },
  interfaith_tension:                { belonging_solidarity: -0.9, wellbeing_atrisk: -0.3, community_capital: -0.3 },

  // Leadership
  leadership_visible_presence:       { leadership: +1.0 },
  leadership_clear_guidance:         { leadership: +1.1, lifesaving_behavior: +0.4 },
  leadership_absence:                { leadership: -1.3, lifesaving_behavior: -0.4 },
  leadership_credibility_loss:       { leadership: -1.1, narrative: -0.3 },
  political_distrust:                { leadership: -1.0, narrative: -0.4, information_communication: -0.3 },
  consensus_on_priorities:           { leadership: +0.5, community_capital: +0.6, narrative: +0.2 },
  dissensus_blocks_action:           { leadership: -0.6, community_capital: -0.7, narrative: -0.3 },
  coordination_failure:              { leadership: -1.0, community_capital: -0.6, functional_continuity: -0.5 },
  coordination_success:              { leadership: +1.0, community_capital: +0.6, functional_continuity: +0.4 },
  feedback_loop_closure:             { leadership: +0.7, information_communication: +0.5 },
  civic_engagement_constructive:     { leadership: +0.8, community_capital: +0.4 },
  civil_society_mobilization:        { leadership: +0.5, community_capital: +0.9 },
  accountability_demand_constructive: { leadership: +0.7, information_communication: +0.3 },

  // Information
  information_clarity:               { information_communication: +1.0, lifesaving_behavior: +0.4 },
  information_confusion:             { information_communication: -1.0, leadership: -0.4, lifesaving_behavior: -0.3 },
  rumor_spread:                      { information_communication: -1.2, narrative: -0.5 },
  rumor_correction:                  { information_communication: +1.0, narrative: +0.4 },
  trusted_information_source:        { information_communication: +0.9, leadership: +0.4, narrative: +0.3 },
  mistrusted_information_source:     { information_communication: -0.9, leadership: -0.4, narrative: -0.3 },
  feedback_channel_open:             { information_communication: +0.7, leadership: +0.4, community_capital: +0.3 },
  feedback_channel_blocked:          { information_communication: -0.7, leadership: -0.4, community_capital: -0.3 },
  active_information_seeking:        { information_communication: +0.7 },
  information_actionable_effective:  { information_communication: +1.0, lifesaving_behavior: +0.6 },
  information_effectiveness_gap:     { information_communication: -1.0, lifesaving_behavior: -0.5 },
  information_inclusivity_present:   { information_communication: +1.0, wellbeing_atrisk: +0.5 },
  information_inclusivity_gap:       { information_communication: -1.0, wellbeing_atrisk: -0.5, belonging_solidarity: -0.4 },
  hostile_influence_operation:       { information_communication: -1.1, narrative: -0.4, leadership: -0.3 },
  news_avoidance_behavior:           { information_communication: -0.6, lifesaving_behavior: -0.3 },
  media_literacy_demonstrated:       { information_communication: +0.6, community_capital: +0.5 },

  // Continuity
  service_continuity:                { functional_continuity: +1.0 },
  service_disruption:                { functional_continuity: -1.5, wellbeing_atrisk: -0.4 },
  routine_maintenance:               { functional_continuity: +0.9, narrative: +0.2 },
  routine_disruption:                { functional_continuity: -0.7, wellbeing_atrisk: -0.3 },
  evacuation_displacement:           { functional_continuity: -1.0, wellbeing_atrisk: -0.6, belonging_solidarity: -0.3 },
  displacement_resolved:             { functional_continuity: +0.9, wellbeing_atrisk: +0.5, belonging_solidarity: +0.3 },
  system_overload:                   { functional_continuity: -1.0, wellbeing_atrisk: -0.6 },
  system_resilience_under_load:      { functional_continuity: +1.0, wellbeing_atrisk: +0.4 },
  economic_continuity:               { functional_continuity: +0.8, wellbeing_atrisk: +0.4 },
  economic_disruption:               { functional_continuity: -0.8, wellbeing_atrisk: -0.4 },
  post_event_recovery_indicator:     { functional_continuity: +0.7, community_capital: +0.4, narrative: +0.4 },
  recovery_setback:                  { functional_continuity: -0.9, narrative: -0.3, community_capital: -0.3 },
  compensation_received:             { functional_continuity: +0.7, wellbeing_atrisk: +0.4 },
  compensation_blocked:              { functional_continuity: -0.7, wellbeing_atrisk: -0.5, leadership: -0.3 },
  cultural_continuity:               { narrative: +0.6, belonging_solidarity: +0.6, functional_continuity: +0.4 },
  rapid_mobilization:                { functional_continuity: +0.6, community_capital: +0.6, leadership: +0.4 },
  delayed_mobilization:              { functional_continuity: -0.6, community_capital: -0.5, leadership: -0.4 },
  adaptive_practice:                 { functional_continuity: +0.8, community_capital: +0.5, narrative: +0.2 },
  lessons_learned_uptake:            { functional_continuity: +0.6, leadership: +0.5, lifesaving_behavior: +0.3 },
  complacency_or_normalization:      { lifesaving_behavior: -0.7, information_communication: -0.4, narrative: -0.3 },

  // Narrative
  fear_expression:                   { wellbeing_atrisk: -0.7, narrative: -0.3 },
  calm_confidence:                   { narrative: +0.9, wellbeing_atrisk: +0.5 },
  resilience_narrative_positive:     { narrative: +1.0 },
  resilience_narrative_negative:     { narrative: -1.0 },

  // Resources
  resource_mobilization:             { community_capital: +1.0, wellbeing_atrisk: +0.6 },
  resource_shortage:                 { community_capital: -1.0, wellbeing_atrisk: -0.8, functional_continuity: -0.5 },
  self_organization:                 { community_capital: +0.9, belonging_solidarity: +0.6 },
  dependency_on_external_aid:        { community_capital: -0.5, functional_continuity: -0.3 },
  local_capacity_demonstrated:       { community_capital: +0.9, functional_continuity: +0.4 },

  // Wellbeing
  harm_to_population:                { wellbeing_atrisk: -1.2, narrative: -0.4 },
  psychological_distress:            { wellbeing_atrisk: -1.0 },
  wellbeing_support_accessed:        { wellbeing_atrisk: +0.7, community_capital: +0.4, belonging_solidarity: +0.3 },
  inequitable_resource_access:       { wellbeing_atrisk: -0.8, community_capital: -0.5, belonging_solidarity: -0.4 },
  equitable_resource_distribution:   { wellbeing_atrisk: +0.3, community_capital: +0.4, belonging_solidarity: +0.4 },
  child_distress:                    { wellbeing_atrisk: -0.9, belonging_solidarity: -0.2 },
  parental_burden:                   { wellbeing_atrisk: -0.7, functional_continuity: -0.3 },
  reservist_family_strain:           { wellbeing_atrisk: -0.8, community_capital: -0.3, belonging_solidarity: -0.2 },
  household_strain_economic:         { wellbeing_atrisk: -0.7, functional_continuity: -0.4 },

  // Preparedness
  preparedness_drill_conducted:      { lifesaving_behavior: +0.8, leadership: +0.5, community_capital: +0.4 },
  preparedness_gap_identified:       { lifesaving_behavior: -0.8, leadership: -0.5 },
  protective_infrastructure_present: { lifesaving_behavior: +0.9, functional_continuity: +0.5 },
  protective_infrastructure_absent:  { lifesaving_behavior: -0.9, wellbeing_atrisk: -0.5 },
  household_readiness_demonstrated:  { lifesaving_behavior: +0.7, community_capital: +0.3 },
  household_readiness_gap:           { lifesaving_behavior: -0.7, wellbeing_atrisk: -0.4 },

  // Education
  educational_continuity:              { functional_continuity: +0.9, wellbeing_atrisk: +0.4 },
  educational_disruption:            { functional_continuity: -1.0, wellbeing_atrisk: -0.5 },
};

/**
 * Assert catalog ↔ mapping coherence (for tests).
 * @returns {string[]} warning messages
 */
export function assertCatalogPolarityCoherence() {
  const warnings = [];
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
  }
  for (const type of Object.keys(SIGNAL_TO_COMPONENTS)) {
    if (!CATALOG_BY_TYPE[type]) warnings.push(`orphan mapping for ${type}`);
  }
  return warnings;
}
