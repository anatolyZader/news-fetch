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

import { COMPONENT_FACETS } from './componentFacets.js';

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
  wellbeing:     'Population Wellbeing',
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
  { type: 'coordination_success',             domain: 'leadership',  label: 'Multiple agencies, services, or organizations coordinate effectively in response', defaultPolarity: 'positive' },
  { type: 'feedback_loop_closure',            domain: 'leadership',  label: 'Authorities visibly act on community input, complaints, or requests', defaultPolarity: 'positive' },

  // E. Information & Communication
  { type: 'information_clarity',              domain: 'information', label: 'Residents report receiving clear, useful information', defaultPolarity: 'positive' },
  { type: 'information_confusion',            domain: 'information', label: 'Residents report confusion, contradictory, or missing information', defaultPolarity: 'negative' },
  { type: 'rumor_spread',                     domain: 'information', label: 'Rumors or misinformation are circulating',          defaultPolarity: 'negative' },
  { type: 'rumor_correction',                 domain: 'information', label: 'Authorities, experts, or community members visibly correct circulating rumors or misinformation', defaultPolarity: 'positive' },
  { type: 'active_information_seeking',       domain: 'information', label: 'Residents actively seek out emergency or protective guidance — shelter locations, HFC instructions, evacuation routes, operational alerts. NOT: legal, financial, religious, or personal planning information.',  defaultPolarity: 'positive' },
  { type: 'information_actionable_effective', domain: 'information', label: 'Guidance is specific, situation-matched, and demonstrably leads to correct protective behavior', defaultPolarity: 'positive' },
  { type: 'information_effectiveness_gap',    domain: 'information', label: 'Guidance exists but fails to help — does not match real constraints, too vague to act on, or leaves critical scenarios uncovered', defaultPolarity: 'negative' },
  { type: 'information_inclusivity_present',  domain: 'information', label: 'Emergency information adapted for at-risk groups (Arabic translations, accessible formats, elder outreach, special-needs channels)', defaultPolarity: 'positive' },
  { type: 'information_inclusivity_gap',      domain: 'information', label: 'Emergency information not reaching at-risk groups (no Arabic, inaccessible formats, elders/disabled left uninformed)', defaultPolarity: 'negative' },

  // F. Functional Continuity
  { type: 'service_continuity',               domain: 'continuity',  label: 'Essential services or institutions are operating',  defaultPolarity: 'positive' },
  { type: 'service_disruption',               domain: 'continuity',  label: 'Essential services, schools, or businesses are closed/disrupted', defaultPolarity: 'negative' },
  { type: 'routine_maintenance',              domain: 'continuity',  label: 'Residents maintain normal daily routines',          defaultPolarity: 'positive' },
  { type: 'system_overload',                  domain: 'continuity',  label: 'Systems (healthcare, emergency, infrastructure) are overwhelmed', defaultPolarity: 'negative' },
  { type: 'system_resilience_under_load',     domain: 'continuity',  label: 'A named system continues operating effectively despite documented elevated demand or disruption', defaultPolarity: 'positive' },
  { type: 'economic_continuity',              domain: 'continuity',  label: 'Local economic activity (employment, business, commerce) sustains during the emergency', defaultPolarity: 'positive' },
  { type: 'economic_disruption',              domain: 'continuity',  label: 'Local economic activity is disrupted: business closures, lost income, employment freeze due to the emergency', defaultPolarity: 'negative' },
  { type: 'post_event_recovery_indicator',    domain: 'continuity',  label: 'Communities visibly recover after a hit: re-opening, return of evacuees, resumed routines', defaultPolarity: 'positive' },
  { type: 'cultural_continuity',              domain: 'continuity',  label: 'Identity-bearing rituals, ceremonies, holidays, or cultural events take place during the emergency', defaultPolarity: 'positive' },

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
  { type: 'local_capacity_demonstrated',      domain: 'resources',   label: 'Community demonstrates self-reliant capacity (own funds, own labour, own infrastructure) without leaning on outside aid', defaultPolarity: 'positive' },

  // I. Population Wellbeing
  { type: 'harm_to_population',              domain: 'wellbeing',   label: 'Physical harm occurred in the community: casualties, injuries, civilians wounded or killed', defaultPolarity: 'negative' },
  { type: 'psychological_distress',          domain: 'wellbeing',   label: 'Named individual or survey reports accumulated trauma, PTSD, grief, or chronic sleep disruption — distinct from situational fear', defaultPolarity: 'negative' },
  { type: 'wellbeing_support_accessed',      domain: 'wellbeing',   label: 'Individuals or groups access psychological support, trauma care, or community wellbeing programs', defaultPolarity: 'positive' },
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

  // Social Cohesion (with T3 narrative spillover for solidarity)
  solidarity_help_others:            { belonging_solidarity: +1.0, wellbeing_atrisk: +0.7, community_capital: +0.6, narrative: +0.3 },
  community_volunteering:            { community_capital: +1.0, belonging_solidarity: +0.7, wellbeing_atrisk: +0.5 },
  social_isolation:                  { belonging_solidarity: -1.0, wellbeing_atrisk: -0.8 },
  conflict_or_tension:               { belonging_solidarity: -1.1, wellbeing_atrisk: -0.4 },

  // Leadership
  leadership_visible_presence:       { leadership: +1.0 },
  leadership_clear_guidance:         { leadership: +1.1 },
  leadership_absence:                { leadership: -1.3, lifesaving_behavior: -0.4 },
  coordination_failure:              { leadership: -1.0, community_capital: -0.6, functional_continuity: -0.5 },
  coordination_success:              { leadership: +1.0, community_capital: +0.6, functional_continuity: +0.4 },
  feedback_loop_closure:             { leadership: +0.7, information_communication: +0.5 },

  // Information
  information_clarity:               { information_communication: +1.0, lifesaving_behavior: +0.4 },
  information_confusion:             { information_communication: -1.0, leadership: -0.4, lifesaving_behavior: -0.3 },
  rumor_spread:                      { information_communication: -1.2, narrative: -0.5 },
  rumor_correction:                  { information_communication: +1.0, narrative: +0.4 },
  active_information_seeking:        { information_communication: +0.7 },
  information_actionable_effective:  { information_communication: +1.0, lifesaving_behavior: +0.6 },
  information_effectiveness_gap:     { information_communication: -1.0, lifesaving_behavior: -0.5 },
  information_inclusivity_present:   { information_communication: +1.0, wellbeing_atrisk: +0.5 },
  information_inclusivity_gap:       { information_communication: -1.0, wellbeing_atrisk: -0.5 },

  // Continuity
  service_continuity:                { functional_continuity: +1.0 },
  service_disruption:                { functional_continuity: -1.5, wellbeing_atrisk: -0.4 },
  routine_maintenance:               { functional_continuity: +0.9 },
  system_overload:                   { functional_continuity: -1.0, wellbeing_atrisk: -0.6 },
  system_resilience_under_load:      { functional_continuity: +1.0, wellbeing_atrisk: +0.4 },
  economic_continuity:               { functional_continuity: +0.8, wellbeing_atrisk: +0.4 },
  economic_disruption:               { functional_continuity: -0.8, wellbeing_atrisk: -0.4 },
  post_event_recovery_indicator:     { functional_continuity: +0.7, community_capital: +0.4, narrative: +0.4 },
  cultural_continuity:               { narrative: +0.6, belonging_solidarity: +0.6, functional_continuity: +0.4 },

  // Narrative (with T3 spillover for fear -> narrative)
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

  // Wellbeing (with T3 spillover for harm -> narrative + belonging)
  harm_to_population:                { wellbeing_atrisk: -1.2, narrative: -0.4, belonging_solidarity: +0.2 },
  psychological_distress:            { wellbeing_atrisk: -1.0 },
  wellbeing_support_accessed:        { wellbeing_atrisk: +0.7, community_capital: +0.4, belonging_solidarity: +0.3 },
};

// ─── Deterministic scoring ────────────────────────────────────────────────────

export const COMPONENT_IDS = [
  'narrative', 'information_communication', 'lifesaving_behavior',
  'functional_continuity', 'community_capital', 'leadership',
  'belonging_solidarity', 'wellbeing_atrisk',
];

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

/**
 * Per-component tuning of the tanh saturation point (`tanhK`) and certainty
 * saturation constant (`certM`). Sparse components (narrative, belonging) use
 * smaller K so net evidence saturates earlier and certainty climbs faster;
 * dense components (lifesaving_behavior, continuity) use larger K so a flood
 * of routine-compliance signals doesn't pin them at the max.
 *
 * These values are author-set heuristics, not data-fit; they are revisited
 * once 30+ days of report history exists for a regression calibration.
 */
export const COMPONENT_TUNING = {
  narrative:                 { tanhK: 1.8, certM: 1.4 },
  information_communication: { tanhK: 2.5, certM: 2.0 },
  lifesaving_behavior:       { tanhK: 3.2, certM: 2.6 },
  functional_continuity:     { tanhK: 2.5, certM: 2.0 },
  community_capital:         { tanhK: 2.2, certM: 1.8 },
  leadership:                { tanhK: 2.2, certM: 1.8 },
  belonging_solidarity:      { tanhK: 1.8, certM: 1.4 },
  wellbeing_atrisk:          { tanhK: 2.5, certM: 2.0 },
};
const DEFAULT_TUNING = { tanhK: 2.5, certM: 2.0 };

const BOOTSTRAP_SAMPLES = 200;
const BOOTSTRAP_SEED = 0x9e3779b1; // golden-ratio constant; deterministic across runs

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tuningFor(componentId) {
  return COMPONENT_TUNING[componentId] ?? DEFAULT_TUNING;
}

function round3(n) { return Math.round(n * 1000) / 1000; }

/** Minimal deterministic LCG so bootstrap CIs are stable across runs/tests. */
function createSeededRng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Per-signal contribution before per-source capping. */
function contributionForSignal(signal, baseWeight) {
  const scope = SCOPE_WEIGHT[signal.scope_level ?? 'single_case'] ?? SCOPE_WEIGHT.single_case;
  const reliabilityKey = signal.evidence_type ?? signal.evidence_class ?? 'observational_reported_fact';
  const reliability = RELIABILITY_WEIGHT[reliabilityKey] ?? RELIABILITY_WEIGHT.observational_reported_fact;
  const temporal = signal.temporal_weight ?? 1.0;
  const extractionConfidence = Math.min(1, Math.max(0, signal.extraction_confidence ?? 1.0));
  return Math.abs(baseWeight) * scope * reliability * temporal * extractionConfidence;
}

/**
 * Apply two-layer source cap.
 *
 * Layer 1 (source-type, 50% threshold): no single `source_type` (news/radio/field/pbo/…)
 * contributes more than 50% of mass for any polarity when ≥2 source_types are present.
 * Catches cross-channel imbalance ("the entire positive case comes from press").
 *
 * Layer 2 (article-source, 35% threshold): no single `article_source` (e.g. ynet.co.il,
 * maariv.co.il) contributes more than 35% of mass for any polarity when ≥2 outlets are
 * present. Catches within-channel imbalance ("the entire press case is a Ynet flood")
 * even when Layer 1 did not fire because the source_type was diverse.
 *
 * Both layers use the same scaling math: if `outlet_mass > threshold * total`, scale
 * every item from that outlet down so its share equals the threshold.
 *
 * @param {Array<{signal: object, contribution: number, polarity: '+'|'-'}>} items
 * @returns {Array<{signal: object, contribution: number, polarity: '+'|'-'}>}
 */
function applySourceCap(items) {
  let out = items.map((it) => ({ ...it }));

  out = capByGroup(out, (sig) => sig.source_type ?? '_unknown', 0.5);

  out = capByGroup(out, (sig) => sig.article_source ?? '_unknown', 0.35);

  return out;
}

/**
 * Cap per-polarity mass attributable to any single bucket above `threshold`.
 * Bucket key is computed from each signal via `keyFn`.
 *
 * Math: to bring a dominant bucket exactly to `threshold` of the new (post-scaling) total:
 *   newDominant / (newDominant + otherMass) = threshold
 *   ⇒ newDominant = threshold · otherMass / (1 − threshold)
 * For threshold=0.5 this collapses to `newDominant = otherMass` (matches the prior code).
 */
function capByGroup(items, keyFn, threshold) {
  const distinctKeys = new Set(items.map((it) => keyFn(it.signal)));
  if (distinctKeys.size <= 1) return items;

  const out = items.map((it) => ({ ...it }));
  for (const polarity of ['+', '-']) {
    const polItems = out.filter((it) => it.polarity === polarity);
    const total = polItems.reduce((s, it) => s + it.contribution, 0);
    if (total === 0) continue;

    const byKey = {};
    for (const it of polItems) {
      const k = keyFn(it.signal);
      byKey[k] = (byKey[k] || 0) + it.contribution;
    }
    if (Object.keys(byKey).length <= 1) continue;

    for (const [key, mass] of Object.entries(byKey)) {
      if (mass / total > threshold) {
        const otherMass = total - mass;
        if (otherMass <= 0) continue; // single-bucket-in-polarity, leave alone
        const targetMass = (threshold * otherMass) / (1 - threshold);
        const scale = targetMass / mass;
        for (const it of polItems) {
          if (keyFn(it.signal) === key) it.contribution *= scale;
        }
      }
    }
  }
  return out;
}

/** Shannon entropy in nats over a count map. */
function shannonEntropy(counts) {
  const total = Object.values(counts).reduce((s, c) => s + c, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const c of Object.values(counts)) {
    if (c <= 0) continue;
    const p = c / total;
    h -= p * Math.log(p);
  }
  return h;
}

function countByType(signals) {
  const m = {};
  for (const s of signals) {
    const t = s.signal_type ?? s.type;
    if (!t) continue;
    m[t] = (m[t] || 0) + 1;
  }
  return m;
}

/**
 * Compute final 1-10 score for one component from its capped contribution items
 * and pre-computed strength/coverage/diversity factors.
 */
function scoreFromItems(items, componentId, totalArticles, articleSet, sourceSet) {
  let positive = 0;
  let negative = 0;
  for (const it of items) {
    if (it.polarity === '+') positive += it.contribution;
    else negative += it.contribution;
  }
  const evidenceMass = positive + negative;
  if (evidenceMass === 0) return null;

  const netEvidence = positive - negative;
  const tuning = tuningFor(componentId);
  const strength = Math.tanh(netEvidence / tuning.tanhK);

  const distinctArticleCount = articleSet.size;
  const coverageRatio = totalArticles > 0 ? distinctArticleCount / totalArticles : 0;
  const coverageAdjustment = 0.70 + 0.30 * Math.sqrt(coverageRatio);

  const sourceDiversityFactor =
    0.85 + 0.15 * Math.min(1, Math.max(0, sourceSet.size - 1) / 3);

  const typeCounts = countByType(items.map((it) => it.signal));
  const distinctTypes = Object.keys(typeCounts).length;
  const H = shannonEntropy(typeCounts);
  const Hmax = Math.log(Math.max(1, distinctTypes));
  const typeDiversityFactor = 0.90 + 0.10 * (Hmax > 0 ? H / Hmax : 0);

  const adjustedStrength = strength * coverageAdjustment * sourceDiversityFactor * typeDiversityFactor;
  const rawScore = Math.round(5.5 + 4.5 * adjustedStrength);
  let score = Math.max(1, Math.min(10, rawScore));

  // Min-mass floor (4f): single thin signal cannot push score outside [3, 8]
  if (evidenceMass < 1.5) {
    score = Math.max(3, Math.min(8, score));
  }

  return {
    score,
    positive,
    negative,
    evidenceMass,
    netEvidence,
    strength,
    coverageRatio,
    coverageAdjustment,
    sourceDiversityFactor,
    typeDiversityFactor,
    signalTypeEntropy: Hmax > 0 ? H / Hmax : 0,
    adjustedStrength,
  };
}

/**
 * Bootstrap a 90% confidence interval on the score by resampling contribution
 * items with replacement N times. Per-source cap and floors are applied to each
 * resample so the CI reflects the same model the headline score uses.
 */
function bootstrapScoreCI(items, componentId, totalArticles) {
  if (items.length === 0) return { score_low: null, score_high: null };
  const rng = createSeededRng(BOOTSTRAP_SEED ^ items.length);
  const n = items.length;
  const scores = [];
  for (let r = 0; r < BOOTSTRAP_SAMPLES; r++) {
    const sample = new Array(n);
    for (let i = 0; i < n; i++) {
      sample[i] = items[Math.floor(rng() * n)];
    }
    const articleSet = new Set();
    const sourceSet = new Set();
    for (const it of sample) {
      const k = it.signal.article_url || (it.signal.article_index ?? null);
      if (k != null) articleSet.add(k);
      if (it.signal.source_type) sourceSet.add(it.signal.source_type);
    }
    const capped = applySourceCap(sample);
    const sc = scoreFromItems(capped, componentId, totalArticles, articleSet, sourceSet);
    if (sc) scores.push(sc.score);
  }
  if (scores.length === 0) return { score_low: null, score_high: null };
  scores.sort((a, b) => a - b);
  const pct = (p) => scores[Math.min(scores.length - 1, Math.floor(p * scores.length))];
  return { score_low: pct(0.05), score_high: pct(0.95) };
}

/**
 * Counterfactual: removing the single article that contributes the most |mass|
 * to this component, what does the score become? Returns the article key and
 * the delta from the headline score.
 */
function counterfactualLargestArticle(items, componentId, totalArticles, currentScore) {
  if (items.length === 0 || currentScore == null) {
    return { counterfactual_article_key: null, counterfactual_delta: null };
  }
  const massByArticle = {};
  for (const it of items) {
    const key = it.signal.article_url || (it.signal.article_index ?? null) || '_no_article';
    massByArticle[key] = (massByArticle[key] || 0) + it.contribution;
  }
  const articleKeys = Object.keys(massByArticle);
  if (articleKeys.length <= 1) {
    return { counterfactual_article_key: null, counterfactual_delta: null };
  }
  const topKey = articleKeys.reduce((a, b) => (massByArticle[a] >= massByArticle[b] ? a : b));
  const remaining = items.filter((it) => {
    const key = it.signal.article_url || (it.signal.article_index ?? null) || '_no_article';
    return key !== topKey;
  });
  if (remaining.length === 0) {
    return { counterfactual_article_key: topKey, counterfactual_delta: null };
  }
  const articleSet = new Set();
  const sourceSet = new Set();
  for (const it of remaining) {
    const k = it.signal.article_url || (it.signal.article_index ?? null);
    if (k != null) articleSet.add(k);
    if (it.signal.source_type) sourceSet.add(it.signal.source_type);
  }
  const capped = applySourceCap(remaining);
  const sc = scoreFromItems(capped, componentId, totalArticles, articleSet, sourceSet);
  if (!sc) return { counterfactual_article_key: topKey, counterfactual_delta: null };
  return {
    counterfactual_article_key: topKey,
    counterfactual_delta: sc.score - currentScore,
  };
}

/**
 * Compute optional per-component facet sub-scores. Each facet is the same
 * directional math restricted to the facet's signal subset. We deliberately
 * skip per-source cap and bootstrap here to keep facets cheap.
 */
function computeFacets(componentId, allComponentSignals, totalArticles) {
  const def = COMPONENT_FACETS[componentId];
  if (!def) return null;
  const out = {};
  for (const [facetName, signalTypes] of Object.entries(def)) {
    const allowed = new Set(signalTypes);
    const subset = allComponentSignals.filter((s) => allowed.has(s.signal_type ?? s.type));
    if (subset.length === 0) {
      out[facetName] = { score: null, signal_count: 0 };
      continue;
    }
    let positive = 0;
    let negative = 0;
    for (const s of subset) {
      const w = SIGNAL_TO_COMPONENTS[s.signal_type ?? s.type]?.[componentId];
      if (w == null) continue;
      const c = contributionForSignal(s, w);
      if (w >= 0) positive += c;
      else negative += c;
    }
    const mass = positive + negative;
    if (mass === 0) {
      out[facetName] = { score: null, signal_count: subset.length };
      continue;
    }
    const tuning = tuningFor(componentId);
    const strength = Math.tanh((positive - negative) / tuning.tanhK);
    const score = Math.max(1, Math.min(10, Math.round(5.5 + 4.5 * strength)));
    out[facetName] = { score, signal_count: subset.length };
  }
  return out;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * v3 scoring model.
 *
 * Per component:
 *   contribution(s,c) = |w_{s,c}| × scope × reliability × temporal × extraction_confidence
 *   per-source cap: no single source > 50% of polarity mass when ≥2 sources
 *   evidence_mass  = positive + negative
 *   net_evidence   = positive − negative
 *   strength       = tanh(net_evidence / tuning.tanhK)
 *   coverage_adj   = 0.70 + 0.30 × √(coverage_ratio)
 *   source_div_f   = 0.85 + 0.15 × min(1, (sources−1)/3)
 *   type_div_f     = 0.90 + 0.10 × normalised_signal_type_entropy
 *   adjusted       = strength × coverage_adj × source_div_f × type_div_f
 *   certainty      = 1 − exp(−evidence_mass / tuning.certM)
 *   polarization   = evidence_mass>0 ? 1 − |net|/mass : 0
 *   score          = round(clamp_{[1,10]}(5.5 + 4.5 × adjusted))
 *                     additionally clamped to [3,8] if evidence_mass < 1.5
 *   score_low/high = 5/95 percentile of N=200 bootstrap resamples
 *   counterfactual_delta = score − score_without_top_article
 *   facets         = optional per-component sub-scores (componentFacets.js)
 *
 * @param {Array}  signals
 * @param {object} opts
 * @param {number} opts.totalArticles
 * @returns {Object}
 */
export function scoreComponents(signals, { totalArticles = 0 } = {}) {
  const results = {};

  for (const id of COMPONENT_IDS) {
    const items = []; // { signal, contribution, polarity }
    const articleSet = new Set();
    const sourceSet = new Set();

    for (const signal of signals) {
      const signalType = signal.signal_type ?? signal.type;
      const mapping = SIGNAL_TO_COMPONENTS[signalType];
      if (!mapping || !(id in mapping)) continue;
      const baseWeight = mapping[id];
      const contribution = contributionForSignal(signal, baseWeight);
      items.push({ signal, contribution, polarity: baseWeight >= 0 ? '+' : '-' });

      const articleKey = signal.article_url || (signal.article_index ?? null);
      if (articleKey != null) articleSet.add(articleKey);
      if (signal.source_type) sourceSet.add(signal.source_type);
    }

    if (items.length === 0) {
      results[id] = {
        score: null, confidence: 'insufficient_data',
        positive_evidence: 0, negative_evidence: 0, net_evidence: 0, evidence_mass: 0,
        strength: 0, coverage_ratio: 0, dispersion: null, coverage_adjustment: 0,
        source_diversity_factor: 0, type_diversity_factor: 0, signal_type_entropy: 0,
        adjusted_strength: 0, certainty: 0, polarization: 0,
        score_low: null, score_high: null,
        counterfactual_article_key: null, counterfactual_delta: null,
        signal_count: 0, distinct_article_count: 0, source_diversity: 0,
        signals: [], facets: computeFacets(id, [], totalArticles),
      };
      continue;
    }

    const cappedItems = applySourceCap(items);
    // Enriched signal copies for downstream UI explainability (N9): each signal carries its
    // FINAL post-cap contribution to this component, the static signal→component weight, and
    // the polarity. We emit copies so the same underlying signal can be enriched differently
    // across the multiple components it routes into without cross-contamination.
    const enrichedSignals = cappedItems.map((it) => ({
      ...it.signal,
      _contribution: round3(it.contribution),
      _weight: SIGNAL_TO_COMPONENTS[it.signal.signal_type ?? it.signal.type]?.[id] ?? 0,
      _polarity: it.polarity,
    }));
    const sc = scoreFromItems(cappedItems, id, totalArticles, articleSet, sourceSet);
    if (!sc) {
      results[id] = {
        score: null, confidence: 'insufficient_data',
        positive_evidence: 0, negative_evidence: 0, net_evidence: 0, evidence_mass: 0,
        strength: 0, coverage_ratio: 0, dispersion: null, coverage_adjustment: 0,
        source_diversity_factor: 0, type_diversity_factor: 0, signal_type_entropy: 0,
        adjusted_strength: 0, certainty: 0, polarization: 0,
        score_low: null, score_high: null,
        counterfactual_article_key: null, counterfactual_delta: null,
        signal_count: 0, distinct_article_count: 0, source_diversity: 0,
        signals: [], facets: computeFacets(id, [], totalArticles),
      };
      continue;
    }

    const tuning = tuningFor(id);
    const certainty = 1 - Math.exp(-sc.evidenceMass / tuning.certM);
    const polarization = sc.evidenceMass > 0
      ? 1 - Math.abs(sc.netEvidence) / sc.evidenceMass
      : 0;

    const dispersion =
      sc.coverageRatio < 0.1 ? 'very_low' :
      sc.coverageRatio < 0.3 ? 'low' :
      sc.coverageRatio < 0.6 ? 'moderate' : 'high';

    const distinctArticleCount = articleSet.size;
    let confidence;
    if (certainty < 0.35 || distinctArticleCount === 1) confidence = 'low';
    else if (certainty < 0.70 || distinctArticleCount < 4) confidence = 'medium';
    else confidence = 'high';

    const ci = bootstrapScoreCI(items, id, totalArticles);
    const cf = counterfactualLargestArticle(cappedItems, id, totalArticles, sc.score);

    results[id] = {
      score: sc.score,
      confidence,
      positive_evidence:       round3(sc.positive),
      negative_evidence:       round3(sc.negative),
      net_evidence:            round3(sc.netEvidence),
      evidence_mass:           round3(sc.evidenceMass),
      strength:                round3(sc.strength),
      coverage_ratio:          sc.coverageRatio,
      dispersion,
      coverage_adjustment:     round3(sc.coverageAdjustment),
      source_diversity_factor: round3(sc.sourceDiversityFactor),
      type_diversity_factor:   round3(sc.typeDiversityFactor),
      signal_type_entropy:     round3(sc.signalTypeEntropy),
      adjusted_strength:       round3(sc.adjustedStrength),
      certainty:               round3(certainty),
      polarization:            round3(polarization),
      score_low:               ci.score_low,
      score_high:              ci.score_high,
      counterfactual_article_key: cf.counterfactual_article_key,
      counterfactual_delta:    cf.counterfactual_delta,
      signal_count:            enrichedSignals.length,
      distinct_article_count:  distinctArticleCount,
      source_diversity:        sourceSet.size,
      signals:                 enrichedSignals,
      facets:                  computeFacets(id, enrichedSignals, totalArticles),
    };
  }

  return results;
}

/** Render confidence as a display string (simple passthrough for v2 string values). */
export function summarizeConfidence(conf) {
  if (!conf || conf === 'insufficient_data') return 'insufficient_data';
  if (typeof conf === 'string') return conf;
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
