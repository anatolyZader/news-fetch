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
  panic_behavior:                    { lifesaving_behavior: -0.7, wellbeing_atrisk: -0.8 },
  unsafe_gathering:                  { lifesaving_behavior: -0.9 },

  // Social Cohesion
  solidarity_help_others:            { belonging_solidarity: +1.0, wellbeing_atrisk: +0.7, community_capital: +0.6 },
  community_volunteering:            { community_capital: +1.0, belonging_solidarity: +0.7, wellbeing_atrisk: +0.5 },
  social_isolation:                  { belonging_solidarity: -1.0, wellbeing_atrisk: -0.8 },
  conflict_or_tension:               { belonging_solidarity: -1.1, wellbeing_atrisk: -0.4 },

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
  fear_expression:                   { wellbeing_atrisk: -0.7 },
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
 * v2 scoring model.
 *
 * Per component:
 *   contribution(signal, component) = |base_weight| × scope × reliability
 *   positive / negative evidence accumulated separately
 *   net_evidence  = positive - negative
 *   evidence_mass = positive + negative
 *   strength      = tanh(net_evidence / k)            ∈ [-1, +1]
 *   coverage_adj  = 0.70 + 0.30 × √(coverage_ratio)  ∈ [0.70, 1.00]
 *   certainty     = 1 - exp(-evidence_mass / m)       ∈ [0, 1)
 *   score         = round(5.5 + 4.5 × strength × coverage_adj)  ∈ [1, 10]
 *   confidence    = composite of certainty + breadth
 *
 * @param {Array}  signals
 * @param {object} opts
 * @param {number} opts.totalArticles
 * @returns {Object}  component_id → { score, confidence, positive_evidence, negative_evidence,
 *                      net_evidence, evidence_mass, strength, coverage_ratio, coverage_adjustment,
 *                      adjusted_strength, certainty, distinct_article_count, dispersion,
 *                      signal_count, source_diversity, signals[] }
 */

const SCOPE_WEIGHT = {
  single_case:         0.35,
  repeated_pattern:    0.65,
  quantified_or_broad: 1.00,
};

// Reliability by evidence_type (v2 schema). Falls back to evidence_class for older signals.
export const RELIABILITY_WEIGHT = {
  direct_quote_named_person:   1.00,
  named_survey_statistic:      0.95,
  named_institutional_fact:    0.90,
  observational_reported_fact: 0.75,
  // Legacy evidence_class fallbacks
  direct_evidence:             0.90,
  observational_evidence:      0.75,
};

const TANH_K = 2.5;   // scaling constant for tanh normalization
const CERT_M = 2.0;   // saturation constant for certainty

export function scoreComponents(signals, { totalArticles = 0 } = {}) {
  const results = {};

  for (const id of COMPONENT_IDS) {
    let positive = 0;
    let negative = 0;
    const componentSignals = [];
    const articleSet = new Set();
    const sourceSet = new Set();

    for (const signal of signals) {
      const signalType = signal.signal_type ?? signal.type;
      const mapping = SIGNAL_TO_COMPONENTS[signalType];
      if (!mapping || !(id in mapping)) continue;

      const baseWeight = mapping[id];
      const scope = SCOPE_WEIGHT[signal.scope_level ?? 'single_case'] ?? SCOPE_WEIGHT.single_case;
      const reliabilityKey = signal.evidence_type ?? signal.evidence_class ?? 'observational_reported_fact';
      const reliability = RELIABILITY_WEIGHT[reliabilityKey] ?? RELIABILITY_WEIGHT.observational_reported_fact;

      const temporalWeight = signal.temporal_weight ?? 1.0;
      const contribution = Math.abs(baseWeight) * scope * reliability * temporalWeight;
      if (baseWeight >= 0) positive += contribution;
      else negative += contribution;

      componentSignals.push(signal);

      const articleKey = signal.article_url || (signal.article_index ?? null);
      if (articleKey != null) articleSet.add(articleKey);
      if (signal.article_source) sourceSet.add(signal.article_source);
    }

    const evidenceMass = positive + negative;
    const netEvidence  = positive - negative;

    if (evidenceMass === 0) {
      results[id] = {
        score: null, confidence: 'insufficient_data',
        positive_evidence: 0, negative_evidence: 0, net_evidence: 0, evidence_mass: 0,
        strength: 0, coverage_ratio: 0, dispersion: null, coverage_adjustment: 0,
        adjusted_strength: 0, certainty: 0,
        signal_count: 0, distinct_article_count: 0, source_diversity: 0,
        signals: [],
      };
      continue;
    }

    const strength    = Math.tanh(netEvidence / TANH_K);
    const certainty   = 1 - Math.exp(-evidenceMass / CERT_M);

    const distinctArticleCount = articleSet.size;
    const coverageRatio        = totalArticles > 0 ? distinctArticleCount / totalArticles : 0;
    const dispersion           =
      coverageRatio < 0.1 ? 'very_low' :
      coverageRatio < 0.3 ? 'low' :
      coverageRatio < 0.6 ? 'moderate' : 'high';

    const coverageAdjustment  = 0.70 + 0.30 * Math.sqrt(coverageRatio);
    const adjustedStrength    = strength * coverageAdjustment;
    const score = Math.max(1, Math.min(10, Math.round(5.5 + 4.5 * adjustedStrength)));

    let confidence;
    if (certainty < 0.35 || distinctArticleCount === 1)  confidence = 'low';
    else if (certainty < 0.70 || distinctArticleCount < 4) confidence = 'medium';
    else confidence = 'high';

    results[id] = {
      score,
      confidence,
      positive_evidence:    round3(positive),
      negative_evidence:    round3(negative),
      net_evidence:         round3(netEvidence),
      evidence_mass:        round3(evidenceMass),
      strength:             round3(strength),
      coverage_ratio:       coverageRatio,
      dispersion,
      coverage_adjustment:  round3(coverageAdjustment),
      adjusted_strength:    round3(adjustedStrength),
      certainty:            round3(certainty),
      signal_count:         componentSignals.length,
      distinct_article_count: distinctArticleCount,
      source_diversity:     sourceSet.size,
      signals:              componentSignals,
    };
  }

  return results;
}

function round3(n) { return Math.round(n * 1000) / 1000; }

/** Render confidence as a display string (simple passthrough for v2 string values). */
export function summarizeConfidence(conf) {
  if (!conf || conf === 'insufficient_data') return 'insufficient_data';
  if (typeof conf === 'string') return conf;
  // Legacy structured object from mid-refactor
  return conf.signal_confidence ?? 'insufficient_data';
}

/**
 * Compute overall score as a certainty-weighted mean.
 * Components with almost no evidence do not pull the overall score as much as
 * components with broad, reliable evidence.
 */
export function overallScore(componentScores) {
  const scored = Object.values(componentScores).filter((c) => c.score !== null && c.certainty > 0);
  if (scored.length === 0) return null;
  const totalCertainty = scored.reduce((s, c) => s + c.certainty, 0);
  return Math.round(scored.reduce((s, c) => s + c.score * c.certainty, 0) / totalCertainty);
}
