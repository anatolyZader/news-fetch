/**
 * Closed-vocabulary behavior signal taxonomy for community resilience analysis.
 *
 * Architecture (from design spec):
 *   1. Atomic signals only — one verb, one behavioral fact per signal
 *   2. Closed vocabulary — LLM chooses from this fixed enum, never invents types
 *   3. Many-to-many mapping — one signal affects multiple components
 *   4. LLM extracts → code maps & scores (deterministic, auditable)
 *
 * Component IDs match resilienceComponents.js:
 *   narrative, information_communication, lifesaving_behavior,
 *   functional_continuity, community_capital, leadership,
 *   belonging_solidarity, wellbeing_atrisk
 */

// ─── Signal taxonomy ──────────────────────────────────────────────────────────

export const SIGNAL_DOMAINS = {
  compliance:    'Compliance & Discipline',
  risk:          'Risk & Safety',
  social:        'Social Cohesion',
  leadership:    'Leadership & Governance',
  information:   'Information & Communication',
  continuity:    'Functional Continuity',
  narrative:     'Emotional / Narrative',
  resources:     'Community Resources',
};

/**
 * All valid signal types the LLM may emit.
 * Each entry: { type, domain, label, defaultPolarity }
 */
export const SIGNAL_CATALOG = [
  // A. Compliance & Discipline
  { type: 'compliance_enter_shelter',         domain: 'compliance',  label: 'Residents enter shelter when alerted',           defaultPolarity: 'positive' },
  { type: 'compliance_follow_instructions',   domain: 'compliance',  label: 'Residents follow official protective instructions', defaultPolarity: 'positive' },
  { type: 'non_compliance_exit_early',        domain: 'compliance',  label: 'Residents leave shelter before all-clear',         defaultPolarity: 'negative' },
  { type: 'non_compliance_ignore_guidelines', domain: 'compliance',  label: 'Residents ignore or dismiss safety guidelines',     defaultPolarity: 'negative' },

  // B. Risk & Safety
  { type: 'risk_exposure_behavior',           domain: 'risk',        label: 'Residents expose themselves to risk (filming, staying outside)', defaultPolarity: 'negative' },
  { type: 'panic_behavior',                   domain: 'risk',        label: 'Chaotic or unsafe reactions during alerts',        defaultPolarity: 'negative' },
  { type: 'unsafe_gathering',                 domain: 'risk',        label: 'Gatherings that violate safety guidelines',        defaultPolarity: 'negative' },

  // C. Social Cohesion
  { type: 'solidarity_help_others',           domain: 'social',      label: 'Residents help neighbors, strangers, or community members', defaultPolarity: 'positive' },
  { type: 'community_volunteering',           domain: 'social',      label: 'Organized or spontaneous volunteering',            defaultPolarity: 'positive' },
  { type: 'social_isolation',                 domain: 'social',      label: 'Residents withdraw, are isolated, or excluded',    defaultPolarity: 'negative' },
  { type: 'conflict_or_tension',              domain: 'social',      label: 'Reported conflicts, scapegoating, or inter-group tension', defaultPolarity: 'negative' },

  // D. Leadership & Governance
  { type: 'leadership_visible_presence',      domain: 'leadership',  label: 'Leadership is publicly visible and active',        defaultPolarity: 'positive' },
  { type: 'leadership_clear_guidance',        domain: 'leadership',  label: 'Leadership provides clear, specific directions',   defaultPolarity: 'positive' },
  { type: 'leadership_absence',               domain: 'leadership',  label: 'Leadership is absent, unavailable, or unresponsive', defaultPolarity: 'negative' },
  { type: 'coordination_failure',             domain: 'leadership',  label: 'Inter-agency or inter-organization coordination breaks down', defaultPolarity: 'negative' },

  // E. Information & Communication
  { type: 'information_clarity',              domain: 'information', label: 'Residents report receiving clear, useful information', defaultPolarity: 'positive' },
  { type: 'information_confusion',            domain: 'information', label: 'Residents report confusion, contradictory, or missing information', defaultPolarity: 'negative' },
  { type: 'rumor_spread',                     domain: 'information', label: 'Rumors or misinformation are circulating',          defaultPolarity: 'negative' },
  { type: 'active_information_seeking',       domain: 'information', label: 'Residents actively seek out official information',  defaultPolarity: 'positive' },

  // F. Functional Continuity
  { type: 'service_continuity',               domain: 'continuity',  label: 'Essential services or institutions are operating',  defaultPolarity: 'positive' },
  { type: 'service_disruption',               domain: 'continuity',  label: 'Essential services, schools, or businesses are closed/disrupted', defaultPolarity: 'negative' },
  { type: 'routine_maintenance',              domain: 'continuity',  label: 'Residents maintain normal daily routines',          defaultPolarity: 'positive' },
  { type: 'system_overload',                  domain: 'continuity',  label: 'Systems (healthcare, emergency, infrastructure) are overwhelmed', defaultPolarity: 'negative' },

  // G. Emotional / Narrative
  { type: 'fear_expression',                  domain: 'narrative',   label: 'Residents express fear, anxiety, or trauma',       defaultPolarity: 'negative' },
  { type: 'calm_confidence',                  domain: 'narrative',   label: 'Residents express calm, confidence, or sense of control', defaultPolarity: 'positive' },
  { type: 'resilience_narrative_positive',    domain: 'narrative',   label: 'Residents describe the community as coping effectively', defaultPolarity: 'positive' },
  { type: 'resilience_narrative_negative',    domain: 'narrative',   label: 'Residents contradict or reject the official coping narrative', defaultPolarity: 'negative' },

  // H. Community Resources
  { type: 'resource_mobilization',            domain: 'resources',   label: 'Community or authority mobilizes material/human resources', defaultPolarity: 'positive' },
  { type: 'resource_shortage',                domain: 'resources',   label: 'Community reports shortage of resources, services, or support', defaultPolarity: 'negative' },
  { type: 'self_organization',                domain: 'resources',   label: 'Community organizes itself without external direction', defaultPolarity: 'positive' },
  { type: 'dependency_on_external_aid',       domain: 'resources',   label: 'Community depends heavily on external aid due to local capacity gaps', defaultPolarity: 'negative' },
];

export const SIGNAL_TYPES = SIGNAL_CATALOG.map((s) => s.type);

// ─── Many-to-many mapping: signal → component weights ─────────────────────────
//
// Format: { signal_type: { component_id: weight } }
// Positive weight = signal strengthens this component's score
// Negative weight = signal weakens this component's score
//
// The LLM maps signals → component IDs is done here in code, not by the LLM.

export const SIGNAL_TO_COMPONENTS = {
  // Compliance
  compliance_enter_shelter:          { lifesaving_behavior: +1.0 },
  compliance_follow_instructions:    { lifesaving_behavior: +0.9 },
  non_compliance_exit_early:         { lifesaving_behavior: -1.2 },
  non_compliance_ignore_guidelines:  { lifesaving_behavior: -1.0 },

  // Risk
  risk_exposure_behavior:            { lifesaving_behavior: -1.0 },
  panic_behavior:                    { lifesaving_behavior: -0.7, wellbeing_atrisk: -0.8, narrative: -0.5 },
  unsafe_gathering:                  { lifesaving_behavior: -0.9 },

  // Social Cohesion
  solidarity_help_others:            { belonging_solidarity: +1.0, wellbeing_atrisk: +0.7, community_capital: +0.6 },
  community_volunteering:            { community_capital: +1.0, belonging_solidarity: +0.7, wellbeing_atrisk: +0.5 },
  social_isolation:                  { belonging_solidarity: -1.0, wellbeing_atrisk: -0.8 },
  conflict_or_tension:               { belonging_solidarity: -1.1, narrative: -0.5, wellbeing_atrisk: -0.4 },

  // Leadership
  leadership_visible_presence:       { leadership: +1.0 },
  leadership_clear_guidance:         { leadership: +1.1, information_communication: +0.4 },
  leadership_absence:                { leadership: -1.3, lifesaving_behavior: -0.4 },
  coordination_failure:              { leadership: -1.0, community_capital: -0.6, functional_continuity: -0.5 },

  // Information
  information_clarity:               { information_communication: +1.0, lifesaving_behavior: +0.4 },
  information_confusion:             { information_communication: -1.0, leadership: -0.4, lifesaving_behavior: -0.3 },
  rumor_spread:                      { information_communication: -1.2, narrative: -0.5 },
  active_information_seeking:        { information_communication: +0.7 },

  // Continuity
  service_continuity:                { functional_continuity: +1.0 },
  service_disruption:                { functional_continuity: -1.5, wellbeing_atrisk: -0.4 },
  routine_maintenance:               { functional_continuity: +0.9 },
  system_overload:                   { functional_continuity: -1.0, wellbeing_atrisk: -0.6 },

  // Narrative
  fear_expression:                   { narrative: -0.8, wellbeing_atrisk: -0.7 },
  calm_confidence:                   { narrative: +0.9, wellbeing_atrisk: +0.5 },
  resilience_narrative_positive:     { narrative: +1.0 },
  resilience_narrative_negative:     { narrative: -1.0 },

  // Resources
  resource_mobilization:             { community_capital: +1.0, wellbeing_atrisk: +0.6 },
  resource_shortage:                 { community_capital: -1.0, wellbeing_atrisk: -0.8, functional_continuity: -0.5 },
  self_organization:                 { community_capital: +0.9, belonging_solidarity: +0.6 },
  dependency_on_external_aid:        { community_capital: -0.5, functional_continuity: -0.3 },
};

// ─── Deterministic scoring ────────────────────────────────────────────────────

const COMPONENT_IDS = [
  'narrative', 'information_communication', 'lifesaving_behavior',
  'functional_continuity', 'community_capital', 'leadership',
  'belonging_solidarity', 'wellbeing_atrisk',
];

/**
 * Score all 8 components from extracted signals.
 *
 * Algorithm:
 *   raw_score = Σ (base_weight × intensity × confidence) for all signals mapped to this component
 *   score (1–10) = sigmoid(raw_score) × 9 + 1    — maps (−∞,+∞) → (1,10)
 *   confidence = 'insufficient_data' | 'low' | 'medium' | 'high'  (by signal count)
 *
 * @param {Array} signals  Output of extractSignals() — each has { type, intensity, confidence, ... }
 * @returns {Object}       { component_id → { score, confidence, raw_score, signal_count, signals[] } }
 */
export function scoreComponents(signals) {
  const raw = Object.fromEntries(COMPONENT_IDS.map((id) => [id, 0]));
  const byComponent = Object.fromEntries(COMPONENT_IDS.map((id) => [id, []]));

  for (const signal of signals) {
    const signalType = signal.signal_type ?? signal.type; // support both field names
    const mapping = SIGNAL_TO_COMPONENTS[signalType];
    if (!mapping) continue;
    const intensity = signal.intensity ?? 0.5;
    const conf = signal.confidence ?? 0.5;
    for (const [component, baseWeight] of Object.entries(mapping)) {
      if (!(component in raw)) continue;
      raw[component] += baseWeight * intensity * conf;
      byComponent[component].push(signal);
    }
  }

  const results = {};
  for (const id of COMPONENT_IDS) {
    const count = byComponent[id].length;
    const rawScore = raw[id];

    let score, confidence;
    if (count === 0) {
      score = null;
      confidence = 'insufficient_data';
    } else {
      const sigmoid = 1 / (1 + Math.exp(-rawScore));
      score = Math.max(1, Math.min(10, Math.round(sigmoid * 9 + 1)));
      confidence = count < 3 ? 'low' : count < 7 ? 'medium' : 'high';
    }

    results[id] = {
      score,
      confidence,
      raw_score: rawScore,
      signal_count: count,
      signals: byComponent[id],
    };
  }

  return results;
}

/**
 * Compute overall score as the mean of components that have data.
 */
export function overallScore(componentScores) {
  const scored = Object.values(componentScores).filter((c) => c.score !== null);
  if (scored.length === 0) return null;
  return Math.round(scored.reduce((s, c) => s + c.score, 0) / scored.length);
}
