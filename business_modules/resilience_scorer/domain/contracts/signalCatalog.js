/**
 * Closed-vocabulary signal catalog — shared extraction TAXONOMY.
 *
 * Pipeline position: Phase 1 foundation. Extraction (closed catalogue) may only
 * emit types listed here; assess partitions signals into components via
 * SIGNAL_TO_COMPONENTS (signalRouting.js); specialist agents cite these type ids.
 *
 * Owns: which signal types exist, domain groupings, labels/disambiguation for
 * extraction prompts, mirrors/related integrity, legacy aliases.
 *
 * Does NOT own: component routing weights or primary/inferred roles (those live
 * in domain/services/signals/routing/signalRouting.js). Does not produce
 * numeric resilience scores (min-math).
 *
 * Key collaborators: signalCatalogPrompt.js (LLM prompts), extractionPasses.js
 * (per-domain extract), signalRouting.js (must map every catalog type),
 * signalRouter.js (facade re-export).
 *
 * Every field is load-bearing for a specific downstream consumer — see the
 * SignalCatalogEntry typedef below before adding/removing fields.
 *
 * Note: polarity_override is a signal INSTANCE field, not a catalog field: for
 * whitelisted types (signalInstanceSchema.js), an extracted signal may carry
 * polarity_override: 'positive'|'negative'; when it contradicts
 * defaultPolarity, routing/evidence polarity flips accordingly.
 */

// --- Version ---
/**
 * One closed-vocabulary signal type. Who reads what:
 *
 * @typedef {object} SignalCatalogEntry
 * @property {string} type
 *   Machine id — what the extraction LLM outputs, what keys the
 *   SIGNAL_TO_COMPONENTS routing weights (signalRouting.js), and what evidence
 *   anchors/citations reference. Legacy spellings resolve via SIGNAL_ALIASES.
 * @property {string} label
 *   The DEFINITION the extraction LLM reads — rendered into the Haiku system
 *   prompt (signalCatalogPrompt.js) and shown in client citations
 *   (citationDisplay.js). Editing a label changes extraction behavior.
 * @property {keyof typeof SIGNAL_DOMAINS} domain
 *   Thematic grouping: sections the extraction prompt and lets
 *   extractionPasses.js run focused per-domain-group passes (smaller prompts,
 *   cheaper calls).
 * @property {'behavior'|'attitude'|'structural_state'|'narrative'|'event'|'capacity'} signal_class
 *   Semantic tag rendered into the extraction prompt as a bracketed hint
 *   (signalCatalogPrompt.js). Former consumers (class-mix analytics, class-gated
 *   salience bypass) were removed with the scoring engine; the salience bypass
 *   is now the per-type CRITICAL_BYPASS_SIGNAL_TYPES set in
 *   domain/epistemic/highSalienceBypass.js.
 * @property {'positive'|'negative'} defaultPolarity
 *   Default +/− for an instance of this type. Instance polarity_override (when
 *   allowed) can flip evidence polarity; signalRouting.js validates weight-sign
 *   coherence against this field; socialChannelQuarantine.js derives +/− from it.
 * @property {string} [mirror]
 *   Reciprocal opposite-polarity twin (same phenomenon, inverted outcome).
 *   Feeds the extraction self-check hint (signalCatalogPrompt.js). Validated:
 *   target must exist, mirror back, and have opposite defaultPolarity.
 * @property {string[]} [related]
 *   Maintainer breadcrumbs: confusable/adjacent types with NO polarity
 *   implication. Deliberately NOT emitted into prompts and unused at runtime;
 *   validated so targets can't rot (validateSignalCatalog).
 * @property {ConstructRole} construct_role
 *   MANDATORY epistemic role of the signal in the resilience process:
 *   'pressure' (stressor/adverse event imposing demand), 'capacity' (available
 *   resource/readiness that could be activated), 'response' (action taken under
 *   stress), 'population_state' (condition/attitude of the population),
 *   'institutional_state' (condition of institutions/services/systems),
 *   'outcome' (observed consequence of adaptation or protection),
 *   'narrative_frame' (collective framing/meaning-making). Response/capacity
 *   types must not positively route into wellbeing_at_risk — treatment uptake
 *   is not evidence of wellbeing (enforced by the routing validator).
 *   NOT emitted into extraction prompts; changing it does not bump
 *   CATALOG_VERSION (no effect on the extraction cache key).
 * @property {object} [disambiguation]
 *   Boundary guidance (vs-other-types) emitted into the extraction prompt's
 *   boundaries block (signalCatalogPrompt.js buildDisambiguationBlock).
 * @property {string[]} [example_evidence]
 *   Few-shot evidence examples for the extraction prompt's boundaries block.
 */

/**
 * Human-bump when the closed vocabulary changes in a way that affects
 * extraction prompts, report comparability, or routing coherence checks.
 * Keep in sync with methodology / changelog when types are added or redefined.
 */
export const CATALOG_VERSION = 'v10';

// --- Aliases ---
/**
 * Legacy type-name aliases accepted at ingestion. Aliases are NOT catalog
 * entries: they never appear in SIGNAL_TYPES, the extraction vocabulary, or
 * SIGNAL_TO_COMPONENTS. Resolve with canonicalizeSignalType() before any
 * lookup, validation, or aggregation.
 * @type {Record<string, string>}
 */
export const SIGNAL_ALIASES = {
  leadership_visible_present: 'leadership_visible_presence',
  // 15c: was 'compliance_partial' — a polarity flip (positive target for a
  // negative-named alias); ignore-guidelines is the semantic match.
  non_compliance: 'non_compliance_ignore_guidelines',
};

/**
 * Map a raw extracted/legacy type string to its canonical catalog id.
 * Trims whitespace; unknown names pass through unchanged (callers validate).
 * @param {string | null | undefined} type
 * @returns {string}
 */
export function canonicalizeSignalType(type) {
  const raw = String(type ?? '').trim();
  return SIGNAL_ALIASES[raw] ?? raw;
}

// --- Domains ---
/**
 * Thematic buckets for extraction prompt sections and focused domain passes.
 * Keys are machine ids used on each catalog entry's `domain` field; values are
 * human labels shown in prompts.
 * @type {Record<string, string>}
 */
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

/** @typedef {'pressure'|'capacity'|'response'|'population_state'|'institutional_state'|'outcome'|'narrative_frame'} ConstructRole */

/**
 * Closed enum for the mandatory construct_role field (see typedef above).
 * Downstream: componentSignalGroups stamps it onto collected items;
 * componentEvidence groups primary evidence into construct_role_mix.
 */
export const CONSTRUCT_ROLES = Object.freeze([
  'pressure',
  'capacity',
  'response',
  'population_state',
  'institutional_state',
  'outcome',
  'narrative_frame',
]);

// --- Catalog entries ---
/**
 * Authoritative closed vocabulary: one object per extractable signal type.
 * Do not add per-row essays here — labels, mirrors, and disambiguation on each
 * entry are the documentation the extraction LLM and validators need.
 * @type {Array<{ type: string, construct_role: ConstructRole, domain: string, label: string, defaultPolarity: 'positive'|'negative', signal_class: SignalClass, mirror?: string, related?: string[], disambiguation?: { not_confused_with?: string[], accept_patterns?: string[], reject_patterns?: string[] }, example_evidence?: string[] }>}
 */
export const SIGNAL_CATALOG = [
  // Compliance & Discipline
  {
    type: 'compliance_enter_shelter',
    construct_role: 'response',
    domain: 'compliance',
    signal_class: 'behavior',
    label: 'Residents enter shelter when alerted',
    defaultPolarity: 'positive',
    mirror: 'non_compliance_exit_early',
  },
  {
    type: 'compliance_follow_instructions',
    construct_role: 'response',
    domain: 'compliance',
    signal_class: 'behavior',
    label: 'Residents follow official protective instructions',
    defaultPolarity: 'positive',
    mirror: 'non_compliance_ignore_guidelines',
  },
  {
    type: 'non_compliance_exit_early',
    construct_role: 'response',
    domain: 'compliance',
    signal_class: 'behavior',
    label: 'Residents leave shelter before all-clear',
    defaultPolarity: 'negative',
    mirror: 'compliance_enter_shelter',
  },
  {
    type: 'non_compliance_ignore_guidelines',
    construct_role: 'response',
    domain: 'compliance',
    signal_class: 'behavior',
    label: 'Residents ignore or dismiss safety guidelines',
    defaultPolarity: 'negative',
    mirror: 'compliance_follow_instructions',
  },
  {
    type: 'compliance_partial',
    construct_role: 'response',
    domain: 'compliance',
    signal_class: 'behavior',
    label: 'Residents comply only partially or late (late shelter entry, incomplete adherence) — deficiency reading; set polarity_override: positive when the evidence emphasizes that compliance mostly succeeded',
    defaultPolarity: 'negative',
    related: ['non_compliance_exit_early'],
  },
  {
    type: 'non_compliance_due_to_distrust',
    construct_role: 'response',
    domain: 'compliance',
    signal_class: 'behavior',
    label: 'Residents refuse protective guidance because they distrust the source or alert system',
    defaultPolarity: 'negative',
    related: ['non_compliance_ignore_guidelines'],
    disambiguation: {
      not_confused_with: [
        'mistrusted_information_source',
        'non_compliance_ignore_guidelines',
      ],
      accept_patterns: ['residents ignore sirens because they distrust HFC alerts'],
    },
  },
  {
    type: 'compliance_norm_enforcement',
    construct_role: 'response',
    domain: 'compliance',
    signal_class: 'behavior',
    label: 'Community members informally pressure others to follow safety protocols',
    defaultPolarity: 'positive',
  },
  // Risk & Safety
  {
    type: 'risk_exposure_behavior',
    construct_role: 'response',
    domain: 'risk',
    signal_class: 'behavior',
    label: 'Residents expose themselves to risk (filming, staying outside)',
    defaultPolarity: 'negative',
  },
  {
    type: 'panic_behavior',
    construct_role: 'population_state',
    domain: 'risk',
    signal_class: 'behavior',
    label: 'Chaotic or unsafe reactions during alerts',
    defaultPolarity: 'negative',
    disambiguation: {
      not_confused_with: ['fear_expression'],
      accept_patterns: [
        'crush or trampling at a shelter entrance',
        'drivers abandoning cars mid-road to flee during an alert',
      ],
      reject_patterns: [
        "the word 'panic' describing mood or fear without a concrete unsafe act → fear_expression",
        'reporter characterizes residents as panicked with no described behavior → abstain',
      ],
    },
  },
  {
    type: 'unsafe_gathering',
    construct_role: 'response',
    domain: 'risk',
    signal_class: 'behavior',
    label: 'Gatherings that violate safety guidelines',
    defaultPolarity: 'negative',
  },
  {
    type: 'protection_effective',
    construct_role: 'outcome',
    domain: 'risk',
    signal_class: 'structural_state',
    label: 'A defensive measure demonstrably averted harm (Iron Dome interception, mamad/shelter doctrine, drill saved lives in documented hit)',
    defaultPolarity: 'positive',
    disambiguation: {
      not_confused_with: ['near_miss_reported'],
      accept_patterns: [
        'documented hit with no casualties BECAUSE a protective measure functioned (interception, mamad held, site empty due to closure order)',
        'missile fell near school with no injuries because schools were closed by order',
      ],
      reject_patterns: [
        'harm averted by luck or chance timing with no measure credited → near_miss_reported',
      ],
    },
  },
  {
    type: 'near_miss_reported',
    construct_role: 'pressure',
    domain: 'risk',
    signal_class: 'event',
    label: 'Documented close call where protective measures barely prevented harm',
    defaultPolarity: 'negative',
    disambiguation: {
      not_confused_with: [
        'protection_effective',
        'resilience_narrative_positive',
        'resilience_narrative_negative',
        'fear_narrative',
        'infrastructure_damage_acute',
        'educational_disruption',
      ],
      accept_patterns: [
        'impact meters from residents with no warning — harm averted by chance, not by any measure',
        'documented close call where sheer luck or coincidental timing prevented casualties',
      ],
      reject_patterns: [
        'harm averted because a protective measure worked as designed (interception, closure order, shelter held) → protection_effective',
        'generic salvo or siren activation headline without documented close call → abstain',
        'public mood or media framing without a documented close call → narrative types, not near_miss',
        'building or kindergarten physically damaged with no injuries → infrastructure_damage_acute',
      ],
    },
  },
  {
    type: 'risk_trade_off_behavior',
    construct_role: 'response',
    domain: 'risk',
    signal_class: 'behavior',
    label: 'Residents take calculated risk to reduce another harm (e.g. driving during alert to relieve childcare burden)',
    defaultPolarity: 'negative',
    related: ['risk_exposure_behavior'],
  },
  {
    type: 'public_order_breakdown',
    construct_role: 'outcome',
    domain: 'risk',
    signal_class: 'event',
    label: 'Looting, crime wave, or breakdown of public order during the emergency (distinct from inter-group tension and shared-resource free-riding)',
    defaultPolarity: 'negative',
  },
  // Social Cohesion
  {
    type: 'solidarity_help_others',
    construct_role: 'response',
    domain: 'social',
    signal_class: 'behavior',
    label: 'A concrete helping ACT by residents toward neighbors, strangers or community members — someone did something for someone. A description of cohesion, good relations or the absence of segregation, with no act in it, is inter_group_trust',
    defaultPolarity: 'positive',
    mirror: 'social_isolation',
    disambiguation: {
      not_confused_with: [
        'harm_to_population',
        'community_volunteering',
      ],
      accept_patterns: ['brought food to neighbors unable to reach shelters'],
      reject_patterns: [
        'witnessing injured neighbors without a helping act',
        'co-location in a shelter without assistance',
      ],
    },
    example_evidence: ['Residents brought food to elderly neighbors who could not reach shelters'],
  },
  {
    type: 'community_volunteering',
    construct_role: 'response',
    domain: 'social',
    signal_class: 'behavior',
    label: 'Residents themselves volunteer — organized or spontaneous, in an existing framework or one they started. The VOLUNTEERS are the subject of the sentence. An authority or organization recruiting volunteers, mobilizing them, or standing up a volunteer corps is resource_mobilization, not this',
    defaultPolarity: 'positive',
  },
  {
    type: 'social_isolation',
    construct_role: 'population_state',
    domain: 'social',
    signal_class: 'behavior',
    label: 'Residents withdraw, are isolated, or excluded — including observed weakening of community ties, cohesion, or mutual involvement',
    defaultPolarity: 'negative',
    mirror: 'solidarity_help_others',
    disambiguation: {
      not_confused_with: [
        'resilience_narrative_negative',
        'bridging_capital_failure',
      ],
      reject_patterns: [
        'cross-line cooperation breakdown → bridging_capital_failure',
        // Left as-is: this entry is in DISAMBIGUATION_PRIORITY_TYPES, so every
        // character is charged to the hard-budgeted stable prefix. The othering
        // boundary is carried by conflict_or_tension's own disambiguation, which
        // is not in that list and therefore free.
        'scapegoating or inter-group friction → conflict_or_tension',
      ],
    },
  },
  {
    type: 'conflict_or_tension',
    construct_role: 'population_state',
    domain: 'social',
    signal_class: 'behavior',
    // Narrowed in v9: "scapegoating" moved to out_group_blaming, which is
    // one-directional. Leaving it here made the two types compete in the prompt.
    label: 'Reported conflict or RECIPROCAL friction between groups or residents — both sides described as party to the dispute',
    defaultPolarity: 'negative',
    mirror: 'conflict_resolution',
    related: ['out_group_blaming'],
    disambiguation: {
      not_confused_with: ['out_group_blaming', 'interfaith_tension', 'social_isolation'],
      reject_patterns: [
        'one speaker blaming or othering a group, with no reciprocal friction described → out_group_blaming',
        'friction specifically along religious lines → interfaith_tension',
      ],
    },
  },
  {
    type: 'conflict_resolution',
    construct_role: 'response',
    domain: 'social',
    signal_class: 'behavior',
    label: 'Community actors resolve conflicts constructively, enabling cooperation (mediation, compromise, de-escalation)',
    defaultPolarity: 'positive',
    mirror: 'conflict_or_tension',
  },
  {
    type: 'religious_coping_practice',
    construct_role: 'response',
    domain: 'social',
    signal_class: 'behavior',
    label: 'Faith-based communal coping (prayer assemblies, tehillim groups, ritualized mourning)',
    defaultPolarity: 'positive',
  },
  {
    type: 'interfaith_solidarity',
    construct_role: 'response',
    domain: 'social',
    signal_class: 'behavior',
    label: 'Constructive cooperation across religious lines during the emergency',
    defaultPolarity: 'positive',
    mirror: 'interfaith_tension',
  },
  {
    type: 'interfaith_tension',
    construct_role: 'population_state',
    domain: 'social',
    signal_class: 'behavior',
    label: 'Conflict or tension specifically along religious lines',
    defaultPolarity: 'negative',
    mirror: 'interfaith_solidarity',
  },
  {
    type: 'help_seeking_behavior',
    construct_role: 'response',
    domain: 'social',
    signal_class: 'behavior',
    label: 'Residents actively ask neighbors or institutions for help (distinct from offering help)',
    defaultPolarity: 'positive',
  },
  {
    type: 'bridging_capital_demonstrated',
    construct_role: 'response',
    domain: 'social',
    signal_class: 'behavior',
    label: 'Constructive cooperation across class, ethnic, or geographic lines (not only religious)',
    defaultPolarity: 'positive',
    mirror: 'bridging_capital_failure',
    related: ['interfaith_solidarity'],
  },
  {
    type: 'bridging_capital_failure',
    construct_role: 'response',
    domain: 'social',
    signal_class: 'behavior',
    label: 'Cooperation across community lines breaks down or is blocked',
    defaultPolarity: 'negative',
    mirror: 'bridging_capital_demonstrated',
    related: ['interfaith_tension'],
  },
  {
    type: 'prosocial_norm_violation',
    construct_role: 'response',
    domain: 'social',
    signal_class: 'behavior',
    label: 'Free-riding or norm-breaking in shared emergency resources (shelter hogging, aid queue jumping)',
    defaultPolarity: 'negative',
    related: ['panic_buying_hoarding'],
  },
  {
    type: 'out_group_blaming',
    construct_role: 'narrative_frame',
    domain: 'social',
    signal_class: 'narrative',
    label: 'A speaker places a named population group outside the shared "we" — blaming it for the emergency\'s costs, singling it out as the one not complying, or describing it as behaving differently. One-directional attribution; no reciprocal conflict described',
    defaultPolarity: 'negative',
    related: ['conflict_or_tension', 'interfaith_tension', 'social_isolation', 'blame_narrative'],
    disambiguation: {
      not_confused_with: [
        'conflict_or_tension',
        'interfaith_tension',
        'blame_narrative',
        'social_isolation',
        'inequitable_resource_access',
      ],
      accept_patterns: [
        'קיימת קבוצת מיעוט שאינה מקפידה על ההנחיות מטעמים אמוניים',
        'an official describing "that population" as the reason guidance is ignored',
      ],
      reject_patterns: [
        'both sides described as in friction → conflict_or_tension',
        'fault attributed to authorities or to the response → blame_narrative',
        'individuals withdrawing or being left alone → social_isolation',
        'a measured service or resource disparity between groups → inequitable_resource_access',
      ],
    },
    example_evidence: ['קיימת קבוצת מיעוט שאינה מקפידה על ההנחיות, הנובעת מתפיסות אמוניות'],
  },
  // Leadership & Governance
  {
    type: 'leadership_visible_presence',
    construct_role: 'response',
    domain: 'leadership',
    signal_class: 'structural_state',
    label: 'Leadership is publicly visible and active',
    defaultPolarity: 'positive',
    mirror: 'leadership_absence',
  },
  {
    type: 'leadership_clear_guidance',
    construct_role: 'response',
    domain: 'leadership',
    signal_class: 'structural_state',
    label: 'Leadership provides clear, specific directions',
    defaultPolarity: 'positive',
    disambiguation: {
      not_confused_with: [
        'information_clarity',
        'information_actionable_effective',
        'political_distrust',
      ],
      accept_patterns: [
        'mayor announced shelter hours',
        'HFC approved easing of restrictions',
      ],
      reject_patterns: [
        'pundit strategy commentary',
        'accountability demand without actionable guidance',
      ],
    },
  },
  {
    type: 'leadership_absence',
    construct_role: 'response',
    domain: 'leadership',
    signal_class: 'structural_state',
    label: 'Leadership is absent, unavailable, or unresponsive',
    defaultPolarity: 'negative',
    mirror: 'leadership_visible_presence',
  },
  {
    type: 'leadership_credibility_loss',
    construct_role: 'population_state',
    domain: 'leadership',
    signal_class: 'attitude',
    label: 'Residents or affected groups voice concrete loss of trust in named leadership (broken promises, false reassurances, perceived dishonesty about emergency conditions)',
    defaultPolarity: 'negative',
  },
  {
    type: 'political_distrust',
    construct_role: 'population_state',
    domain: 'leadership',
    signal_class: 'attitude',
    label: 'Residents or named civic figures publicly demand accountability or express distrust of the political/governmental handling of the emergency (specific policy demands, not general partisan opinion)',
    defaultPolarity: 'negative',
    disambiguation: {
      not_confused_with: [
        'leadership_credibility_loss',
        'institutional_abandonment_perception',
      ],
      accept_patterns: ['named mayor demands PM clarify northern return policy'],
      reject_patterns: ['generic partisan opinion without emergency-specific demand'],
    },
  },
  {
    type: 'consensus_on_priorities',
    construct_role: 'institutional_state',
    domain: 'leadership',
    signal_class: 'structural_state',
    label: 'Community actors reach working consensus on goals/priorities and a plan for action (collaboration, agreement on what to do next)',
    defaultPolarity: 'positive',
    mirror: 'dissensus_blocks_action',
  },
  {
    type: 'dissensus_blocks_action',
    construct_role: 'institutional_state',
    domain: 'leadership',
    signal_class: 'structural_state',
    label: 'Mistrust/conflict prevents working consensus or blocks collective action (dissensus, infighting, inability to agree on priorities)',
    defaultPolarity: 'negative',
    mirror: 'consensus_on_priorities',
  },
  {
    type: 'coordination_failure',
    construct_role: 'institutional_state',
    domain: 'leadership',
    signal_class: 'structural_state',
    label: 'Inter-agency or inter-organization coordination breaks down',
    defaultPolarity: 'negative',
    mirror: 'coordination_success',
  },
  {
    type: 'coordination_success',
    construct_role: 'institutional_state',
    domain: 'leadership',
    signal_class: 'structural_state',
    label: 'Multiple agencies, services, or organizations coordinate effectively in response',
    defaultPolarity: 'positive',
    mirror: 'coordination_failure',
  },
  {
    type: 'feedback_loop_closure',
    construct_role: 'institutional_state',
    domain: 'leadership',
    signal_class: 'structural_state',
    label: 'Authorities visibly act on community input, complaints, or requests',
    defaultPolarity: 'positive',
  },
  {
    type: 'civic_engagement_constructive',
    construct_role: 'response',
    domain: 'leadership',
    signal_class: 'behavior',
    label: 'Constructive civic participation (public hearings, lawful protest with concrete demands, organized petitioning)',
    defaultPolarity: 'positive',
  },
  {
    type: 'civil_society_mobilization',
    construct_role: 'response',
    domain: 'leadership',
    signal_class: 'structural_state',
    label: 'NGOs or civil-society organizations step up with organized non-state response',
    defaultPolarity: 'positive',
  },
  {
    type: 'accountability_demand_constructive',
    construct_role: 'response',
    domain: 'leadership',
    signal_class: 'behavior',
    label: 'Public requests for explanations that are answered or visibly addressed (distinct from unanswered political_distrust)',
    defaultPolarity: 'positive',
  },
  {
    type: 'informal_leadership_emergence',
    construct_role: 'response',
    domain: 'leadership',
    signal_class: 'structural_state',
    label: 'Non-official community figures step up with visible coordination or guidance',
    defaultPolarity: 'positive',
  },
  {
    type: 'blame_shifting',
    construct_role: 'response',
    domain: 'leadership',
    signal_class: 'attitude',
    label: 'Named leaders deflect responsibility rather than address the emergency',
    defaultPolarity: 'negative',
    mirror: 'responsibility_avowal',
  },
  {
    type: 'responsibility_avowal',
    construct_role: 'response',
    domain: 'leadership',
    signal_class: 'attitude',
    label: 'Named leaders publicly accept responsibility and commit to corrective action',
    defaultPolarity: 'positive',
    mirror: 'blame_shifting',
  },
  {
    type: 'symbolic_vs_substantive_action',
    construct_role: 'response',
    domain: 'leadership',
    signal_class: 'structural_state',
    label: 'Leadership visibility without substantive delivery (photo-ops, empty gestures)',
    defaultPolarity: 'negative',
    related: ['leadership_visible_presence'],
  },
  {
    type: 'delegation_empowerment',
    construct_role: 'response',
    domain: 'leadership',
    signal_class: 'structural_state',
    label: 'Central authority devolves decision-making to local actors effectively',
    defaultPolarity: 'positive',
  },
  // Information & Communication
  {
    type: 'information_clarity',
    construct_role: 'institutional_state',
    domain: 'information',
    signal_class: 'structural_state',
    label: 'The information residents receive is clear, consistent and understood, or no information gap exists — a statement about message quality or channel availability, with NO claim that anyone acted on it. Evidence that recipients then took the correct protective action is information_actionable_effective',
    defaultPolarity: 'positive',
    mirror: 'information_confusion',
  },
  {
    type: 'information_confusion',
    construct_role: 'institutional_state',
    domain: 'information',
    signal_class: 'structural_state',
    label: 'Residents report confusion, contradictory, or missing information',
    defaultPolarity: 'negative',
    mirror: 'information_clarity',
    disambiguation: {
      not_confused_with: [
        'information_overload',
        'information_effectiveness_gap',
      ],
      reject_patterns: ['policy dispute without safety guidance confusion'],
    },
  },
  {
    type: 'rumor_spread',
    construct_role: 'institutional_state',
    domain: 'information',
    signal_class: 'structural_state',
    label: 'Rumors or misinformation are circulating',
    defaultPolarity: 'negative',
    mirror: 'rumor_correction',
    related: ['misinformation_acted_upon'],
  },
  {
    type: 'misinformation_acted_upon',
    construct_role: 'response',
    domain: 'information',
    signal_class: 'behavior',
    label: 'Residents act on rumors or misinformation (fleeing on a false alarm, refusing protection based on false claims) — behavioral adherence, distinct from circulation',
    defaultPolarity: 'negative',
    related: ['rumor_spread'],
    disambiguation: {
      not_confused_with: [
        'rumor_spread',
        'non_compliance_due_to_distrust',
      ],
      reject_patterns: [
        'rumor circulating without documented action taken on it → rumor_spread',
        'refusal grounded in distrust of a real official source → non_compliance_due_to_distrust',
      ],
    },
  },
  {
    type: 'rumor_correction',
    construct_role: 'response',
    domain: 'information',
    signal_class: 'structural_state',
    label: 'Authorities, experts, or community members visibly correct circulating rumors or misinformation',
    defaultPolarity: 'positive',
    mirror: 'rumor_spread',
  },
  {
    type: 'trusted_information_source',
    construct_role: 'institutional_state',
    domain: 'information',
    signal_class: 'structural_state',
    label: 'Residents rely on or explicitly trust a specific local/official source for emergency information (trusted hotline, known local authority, trusted broadcaster)',
    defaultPolarity: 'positive',
    mirror: 'mistrusted_information_source',
  },
  {
    type: 'mistrusted_information_source',
    construct_role: 'institutional_state',
    domain: 'information',
    signal_class: 'structural_state',
    label: 'Residents explicitly distrust or disregard an emergency information source (source seen as unreliable/lying/ignored), reducing adherence',
    defaultPolarity: 'negative',
    mirror: 'trusted_information_source',
  },
  {
    type: 'feedback_channel_open',
    construct_role: 'institutional_state',
    domain: 'information',
    signal_class: 'structural_state',
    label: 'A working channel exists for the public to ask questions / articulate needs and receive responses (hotline, municipal desk, two-way messaging)',
    defaultPolarity: 'positive',
    mirror: 'feedback_channel_blocked',
  },
  {
    type: 'feedback_channel_blocked',
    construct_role: 'institutional_state',
    domain: 'information',
    signal_class: 'structural_state',
    label: 'Public feedback/inquiry channels are absent, unreachable, or ignored (hotline down, no response, no way to ask/clarify)',
    defaultPolarity: 'negative',
    mirror: 'feedback_channel_open',
    disambiguation: {
      reject_patterns: ['requests via a working channel → the need type'],
    },
  },
  {
    type: 'active_information_seeking',
    construct_role: 'response',
    domain: 'information',
    signal_class: 'behavior',
    label: 'Residents actively seek out emergency or protective guidance — shelter locations, HFC instructions, evacuation routes, operational alerts. NOT: legal, financial, religious, or personal planning information.',
    defaultPolarity: 'positive',
  },
  {
    type: 'information_actionable_effective',
    construct_role: 'institutional_state',
    domain: 'information',
    signal_class: 'structural_state',
    label: 'Guidance was specific and situation-matched AND the evidence states that recipients then took the correct protective action — an observed behavioral OUTCOME is required. Clarity, consistency, volume of output, or the mere existence of a channel is information_clarity',
    defaultPolarity: 'positive',
    mirror: 'information_effectiveness_gap',
    disambiguation: {
      not_confused_with: [
        'leadership_clear_guidance',
        'information_clarity',
      ],
      accept_patterns: ['residents: new app alerts arrived in time to reach shelter'],
      reject_patterns: [
        'alert issuance without evidence of reception or response',
        'community self-reliance or coping statements → narrative types',
      ],
    },
  },
  {
    type: 'information_effectiveness_gap',
    construct_role: 'institutional_state',
    domain: 'information',
    signal_class: 'structural_state',
    label: 'Guidance exists but fails to help — does not match real constraints, too vague to act on, or leaves critical scenarios uncovered',
    defaultPolarity: 'negative',
    mirror: 'information_actionable_effective',
  },
  {
    type: 'information_inclusivity_present',
    construct_role: 'institutional_state',
    domain: 'information',
    signal_class: 'structural_state',
    label: 'Emergency information adapted for at-risk groups (Arabic translations, accessible formats, elder outreach, special-needs channels)',
    defaultPolarity: 'positive',
    mirror: 'information_inclusivity_gap',
  },
  {
    type: 'information_inclusivity_gap',
    construct_role: 'institutional_state',
    domain: 'information',
    signal_class: 'structural_state',
    label: 'Emergency information not reaching at-risk groups (no Arabic, inaccessible formats, elders/disabled left uninformed)',
    defaultPolarity: 'negative',
    mirror: 'information_inclusivity_present',
    disambiguation: {
      not_confused_with: [
        'wellbeing_support_gap',
        'protective_infrastructure_absent',
      ],
      reject_patterns: [
        'needs-mapping or care service gaps → wellbeing_support_gap',
        'shelter/protection gaps → protective_infrastructure_absent',
      ],
    },
  },
  {
    type: 'hostile_influence_operation',
    construct_role: 'pressure',
    domain: 'information',
    signal_class: 'structural_state',
    label: 'Identified foreign or coordinated disinformation push (state actors, bot networks) — distinct from organic rumor_spread',
    defaultPolarity: 'negative',
  },
  {
    type: 'news_avoidance_behavior',
    construct_role: 'response',
    domain: 'information',
    signal_class: 'behavior',
    label: 'Residents intentionally tune out emergency news coverage as coping (media dosing). NOT ignoring alerts or sirens — that is complacency_or_normalization or non-compliance. Set polarity_override: positive when described as deliberate, adaptive dosing',
    defaultPolarity: 'negative',
    related: ['complacency_or_normalization'],
  },
  {
    type: 'media_literacy_demonstrated',
    construct_role: 'response',
    domain: 'information',
    signal_class: 'behavior',
    label: 'Ordinary residents (not authorities) visibly correct misinformation or verify claims',
    defaultPolarity: 'positive',
  },
  {
    type: 'information_overload',
    construct_role: 'institutional_state',
    domain: 'information',
    signal_class: 'structural_state',
    label: 'Residents overwhelmed by volume of alerts or conflicting streams (distinct from confusion about content)',
    defaultPolarity: 'negative',
    related: ['information_confusion'],
  },
  {
    type: 'information_vacuum_post_event',
    construct_role: 'institutional_state',
    domain: 'information',
    signal_class: 'structural_state',
    label: 'Communication drops off after acute phase leaving residents uninformed',
    defaultPolarity: 'negative',
  },
  {
    type: 'language_register_mismatch',
    construct_role: 'institutional_state',
    domain: 'information',
    signal_class: 'structural_state',
    label: 'Emergency guidance uses register or language residents cannot understand or act on',
    defaultPolarity: 'negative',
    related: ['information_effectiveness_gap'],
  },
  {
    type: 'meta_information_present',
    construct_role: 'institutional_state',
    domain: 'information',
    signal_class: 'structural_state',
    label: 'Authorities tell residents when the next update will come or what is still unknown',
    defaultPolarity: 'positive',
    mirror: 'meta_information_gap',
  },
  {
    type: 'meta_information_gap',
    construct_role: 'institutional_state',
    domain: 'information',
    signal_class: 'structural_state',
    label: 'No timeline or commitment for next information — residents left in uncertainty about future updates',
    defaultPolarity: 'negative',
    mirror: 'meta_information_present',
  },
  // Functional Continuity
  {
    type: 'service_continuity',
    construct_role: 'outcome',
    domain: 'continuity',
    signal_class: 'structural_state',
    label: 'Essential services or institutions are operating',
    defaultPolarity: 'positive',
    mirror: 'service_disruption',
  },
  {
    type: 'service_disruption',
    construct_role: 'outcome',
    domain: 'continuity',
    signal_class: 'structural_state',
    label: 'Essential services, schools, or businesses are closed/disrupted',
    defaultPolarity: 'negative',
    mirror: 'service_continuity',
    disambiguation: {
      not_confused_with: [
        'economic_disruption',
        'resource_shortage',
        'routine_disruption',
      ],
      accept_patterns: ['restaurant closed due to rocket fire'],
      reject_patterns: ['business owner expressing fear without closure fact'],
    },
  },
  {
    type: 'routine_maintenance',
    construct_role: 'outcome',
    domain: 'continuity',
    signal_class: 'behavior',
    label: 'Residents maintain normal daily routines',
    defaultPolarity: 'positive',
    mirror: 'routine_disruption',
  },
  {
    type: 'routine_disruption',
    construct_role: 'outcome',
    domain: 'continuity',
    signal_class: 'structural_state',
    label: 'Civilian daily routines (commuting, shopping, leisure, social rhythms) are visibly disrupted by the emergency — distinct from named-institution closures, which are service_disruption',
    defaultPolarity: 'negative',
    mirror: 'routine_maintenance',
    disambiguation: {
      not_confused_with: [
        'service_disruption',
        'economic_disruption',
        'evacuation_displacement',
      ],
      reject_patterns: ['recurring institution closure → service_disruption'],
    },
  },
  {
    type: 'evacuation_displacement',
    construct_role: 'pressure',
    domain: 'continuity',
    signal_class: 'event',
    label: 'Residents are evacuated, displaced, or unable to return home because of the emergency (named community, hotel/relative housing, prolonged absence)',
    defaultPolarity: 'negative',
    mirror: 'displacement_resolved',
    disambiguation: {
      not_confused_with: [
        'self_evacuation_unauthorized',
        'routine_disruption',
      ],
      accept_patterns: ['municipality evacuated 900 residents to hotels'],
    },
  },
  {
    type: 'self_evacuation_unauthorized',
    construct_role: 'response',
    domain: 'continuity',
    signal_class: 'behavior',
    label: 'Residents leave home or community without official evacuation order (self-evacuation, unauthorized departure). Negative as a guidance-system signal (official guidance lagging or mistrusted); set polarity_override: positive when the departure was clearly protective and timely',
    defaultPolarity: 'negative',
    related: ['evacuation_displacement'],
    disambiguation: {
      not_confused_with: [
        'evacuation_displacement',
        'routine_disruption',
      ],
      accept_patterns: ['families left town before any official order'],
      reject_patterns: ['official municipality evacuation to hotels'],
    },
    example_evidence: ['Residents self-evacuated from Kiryat Shmona before the municipality issued orders'],
  },
  {
    type: 'displacement_resolved',
    construct_role: 'outcome',
    domain: 'continuity',
    signal_class: 'event',
    label: 'Evacuees return home or displacement is visibly resolved (mirror of evacuation_displacement)',
    defaultPolarity: 'positive',
    mirror: 'evacuation_displacement',
  },
  {
    type: 'return_intention_expressed',
    construct_role: 'population_state',
    domain: 'continuity',
    signal_class: 'attitude',
    label: 'Evacuees or displaced residents state the intention to return home (commitment to place and community) — stated intention only, not the actual return',
    defaultPolarity: 'positive',
    mirror: 'relocation_intention_expressed',
    disambiguation: {
      reject_patterns: [
        'actual documented return of evacuees → displacement_resolved',
      ],
    },
  },
  {
    type: 'relocation_intention_expressed',
    construct_role: 'population_state',
    domain: 'continuity',
    signal_class: 'attitude',
    label: 'Evacuees or residents state the intention to leave permanently or not return (relocation, emigration from the area) — stated intention only, not the departure itself',
    defaultPolarity: 'negative',
    mirror: 'return_intention_expressed',
    disambiguation: {
      reject_patterns: [
        'actual unauthorized departure → self_evacuation_unauthorized',
        'official evacuation or prolonged displacement fact → evacuation_displacement',
      ],
    },
  },
  {
    type: 'system_overload',
    construct_role: 'institutional_state',
    domain: 'continuity',
    signal_class: 'structural_state',
    label: 'Systems (healthcare, emergency, infrastructure) are overwhelmed',
    defaultPolarity: 'negative',
    mirror: 'system_resilience_under_load',
    disambiguation: {
      accept_patterns: ['welfare department reports it cannot meet demand'],
      reject_patterns: [
        'named service closure → service_disruption',
        'workforce exhaustion → responder_workforce_strain',
      ],
    },
  },
  {
    type: 'system_resilience_under_load',
    construct_role: 'outcome',
    domain: 'continuity',
    signal_class: 'structural_state',
    label: 'A named system continues operating effectively despite documented elevated demand or disruption',
    defaultPolarity: 'positive',
    mirror: 'system_overload',
  },
  {
    type: 'economic_continuity',
    construct_role: 'outcome',
    domain: 'continuity',
    signal_class: 'structural_state',
    label: 'Local economic activity (employment, business, commerce) sustains during the emergency',
    defaultPolarity: 'positive',
    mirror: 'economic_disruption',
  },
  {
    type: 'economic_disruption',
    construct_role: 'outcome',
    domain: 'continuity',
    signal_class: 'structural_state',
    label: 'Local economic activity is disrupted: business closures, lost income, employment freeze due to the emergency',
    defaultPolarity: 'negative',
    mirror: 'economic_continuity',
    disambiguation: {
      not_confused_with: [
        'service_disruption',
        'household_strain_economic',
        'resource_shortage',
      ],
    },
  },
  {
    type: 'post_event_recovery_indicator',
    construct_role: 'outcome',
    domain: 'continuity',
    signal_class: 'event',
    label: 'Communities visibly recover after a hit: re-opening, return of evacuees, resumed routines',
    defaultPolarity: 'positive',
  },
  {
    type: 'recovery_setback',
    construct_role: 'outcome',
    domain: 'continuity',
    signal_class: 'event',
    label: 'Recovery reverses: reopened services close again, repairs fail, evacuees cannot stay home',
    defaultPolarity: 'negative',
  },
  {
    type: 'compensation_received',
    construct_role: 'outcome',
    domain: 'continuity',
    signal_class: 'structural_state',
    label: 'Affected residents or businesses receive promised compensation (Property Tax Fund, pitsuim, grants)',
    defaultPolarity: 'positive',
    mirror: 'compensation_blocked',
  },
  {
    type: 'compensation_blocked',
    construct_role: 'outcome',
    domain: 'continuity',
    signal_class: 'structural_state',
    label: 'Promised compensation or aid payments are delayed, denied, or not reaching claimants',
    defaultPolarity: 'negative',
    mirror: 'compensation_received',
  },
  {
    type: 'cultural_continuity',
    construct_role: 'outcome',
    domain: 'continuity',
    signal_class: 'narrative',
    label: 'Identity-bearing rituals, ceremonies, holidays, or cultural events take place during the emergency',
    defaultPolarity: 'positive',
    disambiguation: {
      not_confused_with: [
        'service_disruption',
        'religious_coping_practice',
        'commemoration_event_observed',
      ],
      accept_patterns: [
        'Passover seder held with community participation despite alerts',
        'holiday ceremony proceeded with public attendance',
      ],
      reject_patterns: [
        'holy sites or houses of worship closed with no public attendance → service_disruption',
        'ceremony cancelled or held empty because institutions are shut → service_disruption',
        'leaders pray privately only while sites remain closed → service_disruption not cultural_continuity',
      ],
    },
  },
  {
    type: 'rapid_mobilization',
    construct_role: 'response',
    domain: 'continuity',
    signal_class: 'structural_state',
    label: 'Resources/services are mobilized quickly to meet needs (rapid access, timely restoration, fast deployment)',
    defaultPolarity: 'positive',
    mirror: 'delayed_mobilization',
  },
  {
    type: 'delayed_mobilization',
    construct_role: 'response',
    domain: 'continuity',
    signal_class: 'structural_state',
    label: 'Resources/services are mobilized too slowly, increasing disruption (slow response, delays in opening/repairing/deploying)',
    defaultPolarity: 'negative',
    mirror: 'rapid_mobilization',
  },
  {
    type: 'supply_chain_disruption',
    construct_role: 'pressure',
    domain: 'continuity',
    signal_class: 'structural_state',
    label: 'Inputs to essential services fail (logistics, procurement, distribution)',
    defaultPolarity: 'negative',
    related: ['service_disruption'],
  },
  {
    type: 'food_security_stress',
    construct_role: 'outcome',
    domain: 'continuity',
    signal_class: 'structural_state',
    label: 'Community faces food access stress due to the emergency',
    defaultPolarity: 'negative',
    mirror: 'food_security_maintained',
  },
  {
    type: 'food_security_maintained',
    construct_role: 'outcome',
    domain: 'continuity',
    signal_class: 'structural_state',
    label: 'Food supply and access remain adequate despite the emergency',
    defaultPolarity: 'positive',
    mirror: 'food_security_stress',
  },
  {
    type: 'infrastructure_damage_acute',
    construct_role: 'pressure',
    domain: 'continuity',
    signal_class: 'event',
    label: 'Physical damage to power, roads, water, or buildings from the emergency',
    defaultPolarity: 'negative',
  },
  {
    type: 'connectivity_outage',
    construct_role: 'pressure',
    domain: 'continuity',
    signal_class: 'structural_state',
    label: 'Telecom, internet, or mobile connectivity failure affecting emergency communication or daily function',
    defaultPolarity: 'negative',
    related: ['service_continuity'],
    disambiguation: {
      not_confused_with: [
        'cyber_attack_on_infrastructure',
        'information_confusion',
      ],
    },
    example_evidence: ['Cell networks down after rocket hits on infrastructure'],
  },
  {
    type: 'workplace_flexibility_response',
    construct_role: 'response',
    domain: 'continuity',
    signal_class: 'structural_state',
    label: 'Employers adjust work (WFH, paid leave) to reduce household strain during emergency',
    defaultPolarity: 'positive',
  },
  // Emotional / Narrative
  {
    type: 'fear_expression',
    construct_role: 'population_state',
    domain: 'narrative',
    signal_class: 'attitude',
    label: 'Residents express fear, anxiety, or trauma',
    defaultPolarity: 'negative',
    mirror: 'calm_confidence',
    disambiguation: {
      not_confused_with: [
        'psychological_distress',
        'service_disruption',
        'economic_disruption',
      ],
      accept_patterns: ['named resident: I have not slept since the sirens'],
      reject_patterns: ['business viability worry without safety fear'],
    },
  },
  {
    type: 'calm_confidence',
    construct_role: 'population_state',
    domain: 'narrative',
    signal_class: 'attitude',
    label: 'Residents express calm, confidence, or sense of control',
    defaultPolarity: 'positive',
    mirror: 'fear_expression',
  },
  {
    type: 'resilience_narrative_positive',
    construct_role: 'narrative_frame',
    domain: 'narrative',
    signal_class: 'narrative',
    label: 'Residents explicitly characterize the community\'s collective coping ("we are managing/strong") — collective self-assessment statements ONLY, never the concrete facts behind them',
    defaultPolarity: 'positive',
    disambiguation: {
      not_confused_with: [
        'leadership_clear_guidance',
        'solidarity_help_others',
        'calm_confidence',
      ],
      accept_patterns: ['residents say we are managing fine despite the rockets'],
      reject_patterns: [
        'official declaring national spirit',
        'list of closed businesses or empty streets',
        'concrete helping act or functioning service → the concrete type',
      ],
    },
  },
  {
    type: 'resilience_narrative_negative',
    construct_role: 'narrative_frame',
    domain: 'narrative',
    signal_class: 'narrative',
    label: 'Residents reject the coping story or describe the collective spirit as broken — collective self-assessment statements ONLY, never the concrete conditions behind them',
    defaultPolarity: 'negative',
    disambiguation: {
      not_confused_with: [
        'political_distrust',
        'institutional_abandonment_perception',
        'social_isolation',
        'wellbeing_support_gap',
      ],
      accept_patterns: ['the spirit in the north has broken'],
      reject_patterns: [
        'policy demand without community mood framing',
        'cohesion or ties decline observed → social_isolation',
        'welfare capacity strain → system_overload / wellbeing_support_gap',
        'shelter/protection gaps → protective_infrastructure_absent',
        'vulnerable left unsupported → wellbeing_support_gap',
        'feels abandoned by state → institutional_abandonment_perception',
      ],
    },
  },
  {
    type: 'institutional_abandonment_perception',
    construct_role: 'narrative_frame',
    domain: 'narrative',
    signal_class: 'narrative',
    label: 'Residents describe feeling abandoned or forgotten by state institutions during the emergency',
    defaultPolarity: 'negative',
    related: ['resilience_narrative_positive'],
    disambiguation: {
      not_confused_with: [
        'political_distrust',
        'resource_shortage',
      ],
      accept_patterns: ['residents say the state forgot us in the north'],
      reject_patterns: ['named policy demand with accountability target → political_distrust'],
    },
    example_evidence: ['Evacuees: we feel the state abandoned us with no timeline to return home'],
  },
  {
    type: 'blame_narrative',
    construct_role: 'narrative_frame',
    domain: 'narrative',
    signal_class: 'narrative',
    label: 'Population-level attribution of fault for the emergency or response failure',
    defaultPolarity: 'negative',
  },
  {
    type: 'heroism_overframing',
    construct_role: 'narrative_frame',
    domain: 'narrative',
    signal_class: 'narrative',
    label: 'Heroism stories obscure systemic failures or unmet needs — requires an explicit obscured-need or failure claim in the text, never infer the obscuring',
    defaultPolarity: 'negative',
    disambiguation: {
      not_confused_with: [
        'solidarity_help_others',
        'resilience_narrative_positive',
      ],
      reject_patterns: [
        'plain heroism or bravery coverage without an explicit claim that needs or failures are being obscured → abstain or the concrete positive type',
      ],
    },
  },
  {
    type: 'historical_analogy_frame',
    construct_role: 'narrative_frame',
    domain: 'narrative',
    signal_class: 'narrative',
    label: "Explicit invocation of past wars or traumas to frame the present emergency. Trauma re-activation ('this is X again') is negative; set polarity_override: positive for mastery framing ('we survived X, we will survive this')",
    defaultPolarity: 'negative',
  },
  {
    type: 'future_orientation_hope',
    construct_role: 'population_state',
    domain: 'narrative',
    signal_class: 'attitude',
    label: 'Residents express hope or constructive forward-looking orientation',
    defaultPolarity: 'positive',
    mirror: 'future_orientation_despair',
  },
  {
    type: 'future_orientation_despair',
    construct_role: 'population_state',
    domain: 'narrative',
    signal_class: 'attitude',
    label: 'Residents express hopelessness about the future or prolonged emergency',
    defaultPolarity: 'negative',
    mirror: 'future_orientation_hope',
  },
  {
    type: 'moral_injury_narrative',
    construct_role: 'narrative_frame',
    domain: 'narrative',
    signal_class: 'attitude',
    label: 'Residents describe ethical violation of their own moral code (distinct from political_distrust)',
    defaultPolarity: 'negative',
  },
  // Community Resources
  {
    type: 'resource_mobilization',
    construct_role: 'response',
    domain: 'resources',
    signal_class: 'structural_state',
    label: 'A community body or authority mobilizes material or human resources for the emergency — recruits volunteers, stands up a team, allocates equipment, budget, vehicles or manpower. The MOBILIZING ACTOR is the subject of the sentence, and a plan to recruit counts. Residents already volunteering is community_volunteering; an unmet need for resources is resource_shortage',
    defaultPolarity: 'positive',
    mirror: 'resource_shortage',
  },
  {
    type: 'resource_shortage',
    construct_role: 'pressure',
    domain: 'resources',
    signal_class: 'structural_state',
    label: 'Community reports shortage of resources, services, or support',
    defaultPolarity: 'negative',
    mirror: 'resource_mobilization',
    disambiguation: {
      not_confused_with: [
        'service_disruption',
        'economic_disruption',
        'compensation_blocked',
      ],
      accept_patterns: ['no compensation has reached business owners'],
      reject_patterns: ['business closed due to rockets without named aid gap'],
    },
  },
  {
    type: 'self_organization',
    construct_role: 'response',
    domain: 'resources',
    signal_class: 'behavior',
    label: 'Community organizes itself without external direction',
    defaultPolarity: 'positive',
  },
  {
    type: 'dependency_on_external_aid',
    construct_role: 'capacity',
    domain: 'resources',
    signal_class: 'structural_state',
    label: 'Community depends heavily on external aid due to local capacity gaps',
    defaultPolarity: 'negative',
    mirror: 'local_capacity_demonstrated',
    disambiguation: {
      not_confused_with: [
        'international_aid_arrival',
        'diaspora_solidarity',
      ],
      reject_patterns: [
        'arrival of aid alone → international_aid_arrival / diaspora_solidarity; dependency requires stated inability to function without it',
      ],
    },
  },
  {
    type: 'local_capacity_demonstrated',
    construct_role: 'capacity',
    domain: 'resources',
    signal_class: 'capacity',
    label: 'Community demonstrates self-reliant capacity (own funds, own labour, own infrastructure) without leaning on outside aid',
    defaultPolarity: 'positive',
    mirror: 'dependency_on_external_aid',
  },
  {
    type: 'volunteer_donor_fatigue',
    construct_role: 'capacity',
    domain: 'resources',
    signal_class: 'structural_state',
    label: 'Volunteer or donor capacity visibly exhausted in protracted emergency',
    defaultPolarity: 'negative',
  },
  {
    type: 'digital_mutual_aid',
    construct_role: 'response',
    domain: 'resources',
    signal_class: 'behavior',
    label: 'Crowdfunding, WhatsApp/Telegram mutual-aid channels mobilize resources',
    defaultPolarity: 'positive',
    related: ['self_organization'],
  },
  {
    type: 'panic_buying_hoarding',
    construct_role: 'response',
    domain: 'resources',
    signal_class: 'behavior',
    label: 'Rush buying or private stockpiling well beyond official guidance (emptied shelves, fuel queues, hoarding). Set polarity_override: positive when described as orderly stocking that stayed within guidance',
    defaultPolarity: 'negative',
    related: ['prosocial_norm_violation', 'food_security_stress'],
    disambiguation: {
      not_confused_with: [
        'prosocial_norm_violation',
        'household_readiness_demonstrated',
        'food_security_stress',
      ],
      accept_patterns: [
        'supermarket shelves emptied within hours as residents stockpile far beyond guidance',
      ],
      reject_patterns: [
        'household stocking per official HFC preparedness guidance → household_readiness_demonstrated',
        'shortage without a buying rush → resource_shortage / food_security_stress',
      ],
    },
  },
  {
    type: 'resource_allocation_transparency',
    construct_role: 'institutional_state',
    domain: 'resources',
    signal_class: 'structural_state',
    label: 'Aid distribution rules and outcomes are visible and accepted',
    defaultPolarity: 'positive',
    mirror: 'resource_allocation_opacity',
  },
  {
    type: 'resource_allocation_opacity',
    construct_role: 'institutional_state',
    domain: 'resources',
    signal_class: 'structural_state',
    label: 'Aid distribution opaque or perceived as unfair without explanation',
    defaultPolarity: 'negative',
    mirror: 'resource_allocation_transparency',
  },
  // Population Wellbeing
  {
    type: 'harm_to_population',
    construct_role: 'pressure',
    domain: 'wellbeing',
    signal_class: 'event',
    label: 'Physical harm occurred in the community: casualties, injuries, civilians wounded or killed',
    defaultPolarity: 'negative',
    disambiguation: {
      not_confused_with: [
        'solidarity_help_others',
        'near_miss_reported',
      ],
      accept_patterns: ['61-year-old injured by shrapnel in Tamra'],
      reject_patterns: [
        'accidents, crime, or building damage without injuries',
        'aggregate injury statistics from protective action itself (hurt while reaching shelters), reported as a named survey/institutional figure → population_survey_finding',
      ],
    },
  },
  {
    type: 'psychological_distress',
    construct_role: 'population_state',
    domain: 'wellbeing',
    signal_class: 'attitude',
    label: 'Named individual or survey reports accumulated trauma, PTSD, grief, or chronic sleep disruption — distinct from situational fear',
    defaultPolarity: 'negative',
  },
  {
    type: 'wellbeing_support_accessed',
    construct_role: 'response',
    domain: 'wellbeing',
    signal_class: 'structural_state',
    label: 'PROVIDER vs RECIPIENT — RECIPIENT SIDE. A resident, family or named group actually took up psychological, trauma, welfare or community-wellbeing support: attended a session or group, joined a programme, accepted a home visit. The RECIPIENT must be the subject of the sentence. If the subject is a service, department, team or authority — including its outreach, its rounds of home visits, or its hotline staffing — use wellbeing_support_provided instead',
    defaultPolarity: 'positive',
    mirror: 'wellbeing_support_gap',
    related: ['wellbeing_support_provided', 'vulnerable_population_mapping'],
    disambiguation: {
      not_confused_with: [
        'wellbeing_support_provided',
        'vulnerable_population_mapping',
        'wellbeing_support_gap',
      ],
      accept_patterns: [
        'residents attended the trauma-support group opened at the community centre',
        'elderly residents received home visits from the welfare team',
      ],
      reject_patterns: [
        'the welfare department is operating / staffed / providing responses → wellbeing_support_provided',
        'the authority maps or monitors who the at-risk residents are → vulnerable_population_mapping',
        'residents cannot reach the support they need → wellbeing_support_gap',
      ],
    },
  },
  {
    type: 'wellbeing_support_provided',
    construct_role: 'institutional_state',
    domain: 'wellbeing',
    signal_class: 'structural_state',
    label: 'PROVIDER vs RECIPIENT — PROVIDER SIDE. A welfare, psychosocial or care service, department, team or hotline is described as operating, staffed, reaching out, conducting home visits, or providing responses, with no named recipient and no uptake claim. The PROVIDER is the subject of the sentence. If the subject is a resident or group who took the support up, use wellbeing_support_accessed',
    defaultPolarity: 'positive',
    related: ['wellbeing_support_accessed', 'wellbeing_support_gap', 'vulnerable_population_mapping'],
    disambiguation: {
      not_confused_with: [
        'wellbeing_support_accessed',
        'vulnerable_population_mapping',
        'service_continuity',
      ],
      accept_patterns: [
        'מחלקת הרווחה פועלת באופן רציף למתן מענה לתושבים',
        'the psychosocial hotline is staffed around the clock',
      ],
      reject_patterns: [
        'a named person or group took up the service → wellbeing_support_accessed',
        'identifying, mapping, or monitoring who the at-risk residents are → vulnerable_population_mapping',
        'non-welfare municipal services running normally → service_continuity',
      ],
    },
  },
  {
    type: 'vulnerable_population_mapping',
    construct_role: 'institutional_state',
    domain: 'wellbeing',
    signal_class: 'structural_state',
    label: 'The authority maintains a mechanism to identify, map, or continuously monitor at-risk individuals or groups — a name-and-place registry, standing per-group protocols, assigned social-worker contact, recurring home-visit rounds. The mechanism itself, not a service anyone received',
    defaultPolarity: 'positive',
    related: ['wellbeing_support_provided', 'wellbeing_support_gap', 'preparedness_drill_conducted'],
    disambiguation: {
      not_confused_with: [
        'wellbeing_support_provided',
        'wellbeing_support_accessed',
        'wellbeing_support_gap',
        'local_capacity_demonstrated',
      ],
      accept_patterns: [
        'מיפוי מדויק בשם ובמקום של האוכלוסיות בסיכון',
        'separate standing protocols for assisted living, nursing-care, seniors, and special-needs residents',
        'social workers keep continuous contact with a defined at-risk list',
      ],
      reject_patterns: [
        'the welfare department is operating, with no mapping or monitoring content → wellbeing_support_provided',
        'a resident received a home visit as care → wellbeing_support_accessed',
        'no entity holds a full picture of the elderly and disabled → wellbeing_support_gap',
        'an official asserting the authority is ready, with no named mechanism → local_capacity_demonstrated',
      ],
    },
    example_evidence: ['מיפוי מדויק בשם ובמקום של האוכלוסיות בסיכון, מחלקת רווחה ממוסדת מגובה בצוותי מתנדבים'],
  },
  {
    type: 'wellbeing_support_gap',
    construct_role: 'capacity',
    domain: 'wellbeing',
    signal_class: 'structural_state',
    label: 'At-risk individuals or groups cannot access needed psychological, welfare, or care support (unstaffed welfare services, elderly without care, trauma care unavailable)',
    defaultPolarity: 'negative',
    mirror: 'wellbeing_support_accessed',
    disambiguation: {
      not_confused_with: [
        'wellbeing_support_accessed',
        'inequitable_resource_access',
      ],
      accept_patterns: [
        'welfare department cannot reach homebound elderly',
        'no entity holds a full picture of elderly and disabled',
      ],
      reject_patterns: [
        'unequal access by subgroup → inequitable_resource_access',
        'general supply shortage → resource_shortage',
      ],
    },
  },
  {
    type: 'inequitable_resource_access',
    construct_role: 'outcome',
    domain: 'wellbeing',
    signal_class: 'structural_state',
    label: 'Unequal access to safety/resources/services across subgroups (disparities, exclusion of vulnerable populations)',
    defaultPolarity: 'negative',
    mirror: 'equitable_resource_distribution',
  },
  {
    type: 'equitable_resource_distribution',
    construct_role: 'outcome',
    domain: 'wellbeing',
    signal_class: 'structural_state',
    label: 'Resources/support are distributed fairly based on needs (equity-aware allocation, non-disparate access)',
    defaultPolarity: 'positive',
    mirror: 'inequitable_resource_access',
  },
  {
    type: 'child_distress',
    construct_role: 'population_state',
    domain: 'wellbeing',
    signal_class: 'attitude',
    label: 'Children-specific psychological distress (regression, separation anxiety, school refusal) — distinct from general psychological_distress',
    defaultPolarity: 'negative',
  },
  {
    type: 'parental_burden',
    construct_role: 'population_state',
    domain: 'wellbeing',
    signal_class: 'structural_state',
    label: 'Parents bear childcare burden during sheltering or school closure',
    defaultPolarity: 'negative',
  },
  {
    type: 'reservist_family_strain',
    construct_role: 'population_state',
    domain: 'wellbeing',
    signal_class: 'structural_state',
    label: 'Household strain from long reserve deployment (single parent, lost wages, absence)',
    defaultPolarity: 'negative',
  },
  {
    type: 'household_strain_economic',
    construct_role: 'population_state',
    domain: 'wellbeing',
    signal_class: 'structural_state',
    label: 'Household cannot pay rent or faces wage loss — distinct from macro economic_disruption',
    defaultPolarity: 'negative',
  },
  {
    type: 'sleep_disruption_population',
    construct_role: 'population_state',
    domain: 'wellbeing',
    signal_class: 'attitude',
    label: 'Population-level sleep disruption reported (surveys, clinics, named patterns)',
    defaultPolarity: 'negative',
  },
  {
    type: 'substance_use_uptick',
    construct_role: 'population_state',
    domain: 'wellbeing',
    signal_class: 'behavior',
    label: 'Documented increase in alcohol, cannabis, or anxiolytic use as coping',
    defaultPolarity: 'negative',
  },
  {
    type: 'domestic_violence_indicator',
    construct_role: 'outcome',
    domain: 'wellbeing',
    signal_class: 'event',
    label: 'Reported fact of domestic violence increase — requires explicit evidence, never infer',
    defaultPolarity: 'negative',
  },
  {
    type: 'suicide_self_harm_indicator',
    construct_role: 'outcome',
    domain: 'wellbeing',
    signal_class: 'event',
    label: 'Reported fact of suicide or self-harm — requires explicit evidence, never infer',
    defaultPolarity: 'negative',
  },
  {
    type: 'population_survey_finding',
    construct_role: 'population_state',
    domain: 'wellbeing',
    signal_class: 'structural_state',
    label: 'FALLBACK ONLY: named survey/institutional finding that fits no substantive type. Prefer the substantive type (e.g. sleep_disruption_population) with evidence_type named_survey_statistic. Set polarity_override: positive for favorable findings (high compliance, high confidence).',
    defaultPolarity: 'negative',
    related: ['positive_wellbeing_marker'],
    disambiguation: {
      not_confused_with: [
        'fear_expression',
        'psychological_distress',
        'sleep_disruption_population',
      ],
      accept_patterns: ['MDA: 790 injured reaching shelters (no substantive type fits)'],
      reject_patterns: [
        'single unnamed quote without survey source',
        'finding fitting a substantive type → that type',
      ],
    },
    example_evidence: ['MDA: 790 people injured reaching shelters during March alerts'],
  },
  {
    type: 'positive_wellbeing_marker',
    construct_role: 'population_state',
    domain: 'wellbeing',
    signal_class: 'attitude',
    label: 'Population-level gratitude, efficacy, or meaning-making (distinct from calm_confidence)',
    defaultPolarity: 'positive',
    related: ['population_survey_finding'],
  },
  // Preparedness & Protective Capacity
  {
    type: 'preparedness_drill_conducted',
    construct_role: 'capacity',
    domain: 'preparedness',
    signal_class: 'event',
    label: 'Municipality or community conducted shelter/emergency drill or exercise',
    defaultPolarity: 'positive',
  },
  {
    type: 'preparedness_gap_identified',
    construct_role: 'capacity',
    domain: 'preparedness',
    signal_class: 'structural_state',
    label: 'Documented gap in preparedness (missing shelters, untrained teams, no plan)',
    defaultPolarity: 'negative',
  },
  {
    type: 'early_warning_system_failure',
    construct_role: 'institutional_state',
    domain: 'preparedness',
    signal_class: 'structural_state',
    label: 'Siren, alert app, or HFC early-warning system failed or arrived too late for protective action',
    defaultPolarity: 'negative',
    mirror: 'early_warning_system_effective',
    disambiguation: {
      not_confused_with: [
        'information_confusion',
        'preparedness_gap_identified',
      ],
      accept_patterns: ['sirens sounded only after impacts were reported'],
    },
    example_evidence: ['Residents report Red Alert app notifications arrived after explosions in Netivot'],
  },
  {
    type: 'early_warning_system_effective',
    construct_role: 'institutional_state',
    domain: 'preparedness',
    signal_class: 'structural_state',
    label: 'Early-warning system delivered timely alerts enabling protective action before harm',
    defaultPolarity: 'positive',
    mirror: 'early_warning_system_failure',
    example_evidence: ['Sirens gave time to reach mamad before impact'],
  },
  {
    type: 'protective_infrastructure_present',
    construct_role: 'capacity',
    domain: 'preparedness',
    signal_class: 'capacity',
    label: 'Protective infrastructure exists and is functional (mamad, shelters, safe rooms)',
    defaultPolarity: 'positive',
    mirror: 'protective_infrastructure_absent',
  },
  {
    type: 'protective_infrastructure_absent',
    construct_role: 'capacity',
    domain: 'preparedness',
    signal_class: 'capacity',
    label: 'Protective infrastructure missing or non-functional for households/institutions',
    defaultPolarity: 'negative',
    mirror: 'protective_infrastructure_present',
  },
  {
    type: 'household_readiness_demonstrated',
    construct_role: 'capacity',
    domain: 'preparedness',
    signal_class: 'capacity',
    label: 'Households demonstrate emergency readiness (stocked kits, practiced plans)',
    defaultPolarity: 'positive',
    mirror: 'household_readiness_gap',
  },
  {
    type: 'household_readiness_gap',
    construct_role: 'capacity',
    domain: 'preparedness',
    signal_class: 'capacity',
    label: 'Households lack basic emergency readiness (no mamad, no supplies, no plan)',
    defaultPolarity: 'negative',
    mirror: 'household_readiness_demonstrated',
  },
  {
    type: 'plan_tested_during_event',
    construct_role: 'outcome',
    domain: 'preparedness',
    signal_class: 'event',
    label: 'Emergency plan visibly tested and worked during the event',
    defaultPolarity: 'positive',
    mirror: 'plan_failed_during_event',
  },
  {
    type: 'plan_failed_during_event',
    construct_role: 'outcome',
    domain: 'preparedness',
    signal_class: 'event',
    label: 'Emergency plan failed when tested during the event',
    defaultPolarity: 'negative',
    mirror: 'plan_tested_during_event',
  },
  {
    type: 'responder_workforce_strain',
    construct_role: 'capacity',
    domain: 'preparedness',
    signal_class: 'structural_state',
    label: 'First-responder or municipal emergency workforce exhaustion documented',
    defaultPolarity: 'negative',
  },
  // Adaptation & Learning
  {
    type: 'adaptive_practice',
    construct_role: 'response',
    domain: 'adaptation',
    signal_class: 'behavior',
    label: 'Community visibly changes routines to cope (rooftop schools, distributed offices, reordered work week)',
    defaultPolarity: 'positive',
    mirror: 'failure_to_adapt',
  },
  {
    type: 'lessons_learned_uptake',
    construct_role: 'response',
    domain: 'adaptation',
    signal_class: 'structural_state',
    label: 'Authorities or communities act on lessons from prior events (revised protocols, faster sirens)',
    defaultPolarity: 'positive',
  },
  {
    type: 'complacency_or_normalization',
    construct_role: 'population_state',
    domain: 'adaptation',
    signal_class: 'attitude',
    label: 'Alert fatigue or risk habituation — sirens/risks treated as background (distinct from defiant non_compliance)',
    defaultPolarity: 'negative',
  },
  {
    type: 'innovation_under_constraint',
    construct_role: 'response',
    domain: 'adaptation',
    signal_class: 'behavior',
    label: 'Community invents new method on the fly beyond routine adaptation',
    defaultPolarity: 'positive',
    related: ['adaptive_practice'],
  },
  {
    type: 'failure_to_adapt',
    construct_role: 'outcome',
    domain: 'adaptation',
    signal_class: 'structural_state',
    label: 'Community or authority sticks with failing approach despite visible evidence',
    defaultPolarity: 'negative',
    mirror: 'adaptive_practice',
  },
  {
    type: 'cross_event_learning',
    construct_role: 'response',
    domain: 'adaptation',
    signal_class: 'structural_state',
    label: 'Explicit application of lessons from a prior emergency round',
    defaultPolarity: 'positive',
    related: ['lessons_learned_uptake'],
  },
  {
    type: 'novel_behavior_observed',
    construct_role: 'population_state',
    domain: 'adaptation',
    signal_class: 'behavior',
    label: 'Repeated novel behavior pattern detected outside catalog (OOV cluster). Set polarity_override: positive when the novel pattern is clearly adaptive',
    defaultPolarity: 'negative',
  },
  // Children & Education
  {
    type: 'educational_continuity',
    construct_role: 'outcome',
    domain: 'education',
    signal_class: 'structural_state',
    label: 'Schools or childcare operate (in-person or protected remote) during emergency',
    defaultPolarity: 'positive',
    mirror: 'educational_disruption',
  },
  {
    type: 'educational_disruption',
    construct_role: 'outcome',
    domain: 'education',
    signal_class: 'structural_state',
    label: 'Schools, kindergartens, or youth programs closed or severely disrupted',
    defaultPolarity: 'negative',
    mirror: 'educational_continuity',
  },
  {
    type: 'learning_loss_documented',
    construct_role: 'outcome',
    domain: 'education',
    signal_class: 'structural_state',
    label: 'Documented learning loss from school disruption',
    defaultPolarity: 'negative',
    related: ['educational_continuity'],
  },
  {
    type: 'school_psychosocial_support_active',
    construct_role: 'response',
    domain: 'education',
    signal_class: 'structural_state',
    label: 'Schools provide active psychosocial support during emergency',
    defaultPolarity: 'positive',
    mirror: 'school_psychosocial_support_gap',
  },
  {
    type: 'school_psychosocial_support_gap',
    construct_role: 'capacity',
    domain: 'education',
    signal_class: 'structural_state',
    label: 'Schools lack psychosocial support for students during emergency',
    defaultPolarity: 'negative',
    mirror: 'school_psychosocial_support_active',
  },
  {
    type: 'educational_equity_gap',
    construct_role: 'outcome',
    domain: 'education',
    signal_class: 'structural_state',
    label: 'School disruption disproportionately affects peripheral or minority student populations',
    defaultPolarity: 'negative',
  },
  // Trust & Legitimacy
  {
    type: 'interpersonal_trust',
    construct_role: 'population_state',
    domain: 'trust',
    signal_class: 'attitude',
    label: 'Residents trust each other in the emergency (use polarity_override when evidence shows erosion)',
    defaultPolarity: 'positive',
  },
  {
    type: 'institutional_trust',
    construct_role: 'population_state',
    domain: 'trust',
    signal_class: 'attitude',
    label: 'Residents trust named institutions in the emergency (use polarity_override when evidence shows erosion)',
    defaultPolarity: 'positive',
  },
  {
    type: 'media_trust',
    construct_role: 'population_state',
    domain: 'trust',
    signal_class: 'attitude',
    label: 'Residents trust media sources for emergency information (use polarity_override when evidence shows erosion)',
    defaultPolarity: 'positive',
  },
  {
    type: 'inter_group_trust',
    construct_role: 'population_state',
    domain: 'trust',
    signal_class: 'attitude',
    label: 'Relations BETWEEN identifiable groups in the community — cohesion, mixing, mutual trust across them, or the absence of segregation and of an in-group/out-group split. A state of intergroup relations, not a helping act; someone doing something for someone is solidarity_help_others (use polarity_override when evidence shows erosion)',
    defaultPolarity: 'positive',
  },
  // Memory & Commemoration
  {
    type: 'commemoration_event_observed',
    construct_role: 'response',
    domain: 'memory',
    signal_class: 'event',
    label: 'Memorial, commemoration, or remembrance event takes place during emergency',
    defaultPolarity: 'positive',
  },
  {
    type: 'memorialization_conflict',
    construct_role: 'narrative_frame',
    domain: 'memory',
    signal_class: 'structural_state',
    label: 'Conflict over how or whether to commemorate during the emergency',
    defaultPolarity: 'negative',
  },
  {
    type: 'anniversary_distress_uptick',
    construct_role: 'population_state',
    domain: 'memory',
    signal_class: 'attitude',
    label: 'Distress increases around anniversary or memorial date',
    defaultPolarity: 'negative',
  },
  // Diaspora & Outside-In Support
  {
    type: 'diaspora_solidarity',
    construct_role: 'capacity',
    domain: 'diaspora',
    signal_class: 'structural_state',
    label: 'Diaspora communities mobilize support for affected area',
    defaultPolarity: 'positive',
  },
  {
    type: 'international_aid_arrival',
    construct_role: 'capacity',
    domain: 'diaspora',
    signal_class: 'structural_state',
    label: 'International aid or volunteers arrive to support the community',
    defaultPolarity: 'positive',
    mirror: 'international_aid_withdrawal',
    disambiguation: {
      not_confused_with: ['dependency_on_external_aid'],
    },
  },
  {
    type: 'international_aid_withdrawal',
    construct_role: 'capacity',
    domain: 'diaspora',
    signal_class: 'structural_state',
    label: 'International aid withdraws or fails to materialize when needed',
    defaultPolarity: 'negative',
    mirror: 'international_aid_arrival',
  },
  // Environmental & Agricultural Impact
  {
    type: 'environmental_damage_acute',
    construct_role: 'pressure',
    domain: 'environmental',
    signal_class: 'event',
    label: 'Acute environmental damage from rockets, fires, or military activity',
    defaultPolarity: 'negative',
  },
  {
    type: 'agricultural_damage',
    construct_role: 'pressure',
    domain: 'environmental',
    signal_class: 'structural_state',
    label: 'Agricultural land, crops, or livestock damaged by the emergency',
    defaultPolarity: 'negative',
  },
  {
    type: 'ecosystem_stress',
    construct_role: 'pressure',
    domain: 'environmental',
    signal_class: 'structural_state',
    label: 'Broader ecosystem stress documented (pollution, habitat, long-term land damage)',
    defaultPolarity: 'negative',
  },
  // Hostage & Captivity
  {
    type: 'hostage_family_advocacy',
    construct_role: 'response',
    domain: 'hostage',
    signal_class: 'behavior',
    label: 'Hostage families organize advocacy or public pressure (documented activity)',
    defaultPolarity: 'positive',
  },
  {
    type: 'hostage_return_event',
    construct_role: 'outcome',
    domain: 'hostage',
    signal_class: 'event',
    label: 'Hostage or captive returns home alive (documented event)',
    defaultPolarity: 'positive',
    disambiguation: {
      reject_patterns: [
        'return of remains / body repatriation of deceased hostages → commemoration_event_observed if a memorial is described, else abstain',
      ],
    },
  },
  {
    type: 'hostage_uncertainty_distress',
    construct_role: 'population_state',
    domain: 'hostage',
    signal_class: 'attitude',
    label: 'Distress from ongoing hostage uncertainty in the community',
    defaultPolarity: 'negative',
  },
  // Cyber & Digital Infrastructure
  {
    type: 'cyber_attack_on_infrastructure',
    construct_role: 'pressure',
    domain: 'cyber',
    signal_class: 'event',
    label: 'Cyber attack disrupts emergency infrastructure (hotlines, municipal systems)',
    defaultPolarity: 'negative',
  },
  {
    type: 'scam_wave_during_emergency',
    construct_role: 'pressure',
    domain: 'cyber',
    signal_class: 'structural_state',
    label: 'Fraud or scam wave targets residents during the emergency',
    defaultPolarity: 'negative',
  },
  {
    type: 'deepfake_misinformation',
    construct_role: 'pressure',
    domain: 'cyber',
    signal_class: 'structural_state',
    label: 'AI-generated or deepfake content spreads as emergency misinformation',
    defaultPolarity: 'negative',
    related: ['hostile_influence_operation'],
  },
];

// --- Derived exports & validation ---
/** Flat list of canonical type ids (derived from SIGNAL_CATALOG). */
export const SIGNAL_TYPES = SIGNAL_CATALOG.map((s) => s.type);

/** O(1) lookup map — prefer getSignalCatalogEntry for external callers. */
const CATALOG_BY_TYPE = Object.fromEntries(SIGNAL_CATALOG.map((s) => [s.type, s]));

/**
 * Look up a catalog entry by type id (does not canonicalize aliases).
 * @param {string} type
 * @returns {SignalCatalogEntry | null}
 */
export function getSignalCatalogEntry(type) {
  return CATALOG_BY_TYPE[type] ?? null;
}

/** Mirror pairs must exist, be reciprocal, and have opposite defaultPolarity. */
function checkCatalogEntryMirror(entry, errors) {
  if (!entry.mirror) return;
  const target = CATALOG_BY_TYPE[entry.mirror];
  if (!target) {
    errors.push(`${entry.type}: mirror target missing: ${entry.mirror}`);
    return;
  }
  if (target.mirror !== entry.type) {
    errors.push(`${entry.type}: mirror not reciprocal (${entry.mirror} mirrors ${target.mirror ?? 'nothing'})`);
  }
  if (target.defaultPolarity === entry.defaultPolarity) {
    errors.push(`${entry.type}: mirror ${entry.mirror} has same defaultPolarity — use related instead`);
  }
}

/** construct_role is mandatory and must be a known enum value. */
function checkCatalogEntryConstructRole(entry, errors) {
  if (!CONSTRUCT_ROLES.includes(entry.construct_role)) {
    errors.push(`${entry.type}: missing or invalid construct_role: ${entry.construct_role}`);
  }
}

/** `related` targets must still exist in the catalog (maintainer breadcrumbs). */
function checkCatalogEntryRelated(entry, errors) {
  for (const rel of entry.related ?? []) {
    if (!CATALOG_BY_TYPE[rel]) {
      errors.push(`${entry.type}: related target missing: ${rel}`);
    }
  }
}

/** No duplicate types; aliases must not collide with catalog ids; alias targets must exist. */
function checkDuplicatesAndAliases(errors) {
  const seen = new Set();
  for (const entry of SIGNAL_CATALOG) {
    if (seen.has(entry.type)) errors.push(`duplicate signal type: ${entry.type}`);
    seen.add(entry.type);
  }
  for (const alias of Object.keys(SIGNAL_ALIASES)) {
    if (seen.has(alias)) errors.push(`alias must not be a catalog entry: ${alias}`);
    if (!seen.has(SIGNAL_ALIASES[alias])) {
      errors.push(`alias target missing from catalog: ${alias} -> ${SIGNAL_ALIASES[alias]}`);
    }
  }
}

/**
 * Taxonomy coherence check (duplicates, aliases, mirror/related integrity).
 * Routing/scoring coherence is validated by the resilience_scorer module
 * (validateSignalRouting in domain/services/signals/routing/signalRouting.js).
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateSignalCatalog() {
  const errors = [];
  const warnings = [];
  checkDuplicatesAndAliases(errors);
  for (const entry of SIGNAL_CATALOG) {
    checkCatalogEntryMirror(entry, errors);
    checkCatalogEntryConstructRole(entry, errors);
    checkCatalogEntryRelated(entry, errors);
  }
  return { errors, warnings };
}

/**
 * Throws if the catalog violates its taxonomy contract.
 * Call from startup/tests — not on every extract request.
 * @throws {Error}
 */
export function assertValidSignalCatalog() {
  const { errors } = validateSignalCatalog();
  if (errors.length > 0) {
    throw new Error(`Invalid signal catalog:\n${errors.join('\n')}`);
  }
}
