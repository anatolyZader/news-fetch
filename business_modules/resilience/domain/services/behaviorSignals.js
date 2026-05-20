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
 *   belonging_solidarity, wellbeing_at_risk
 */

import { COMPONENT_FACETS } from './componentFacets.js';
import { getOutletReliabilityMultiplier } from './outletReliabilityPriors.js';
import {
  CATALOG_VERSION,
  DEFAULT_SCORING_PRIORS,
  SIGNAL_CATALOG,
  SIGNAL_DOMAINS,
  SIGNAL_TO_COMPONENTS,
  SIGNAL_TYPES,
  getScoringPriors,
  getSignalCatalogEntry,
  assertCatalogPolarityCoherence,
} from './signalCatalog.js';
import {
  INTENSITY_WEIGHT,
  POLARITY_OVERRIDE_SIGNAL_TYPES,
} from './signalInstanceSchema.js';

export {
  CATALOG_VERSION,
  DEFAULT_SCORING_PRIORS,
  SIGNAL_CATALOG,
  SIGNAL_DOMAINS,
  SIGNAL_TO_COMPONENTS,
  SIGNAL_TYPES,
  getScoringPriors,
  getSignalCatalogEntry,
  assertCatalogPolarityCoherence,
};
export {
  SIGNAL_CLASSES,
  INTENSITY_LEVELS,
  PHASE_LEVELS,
  AFFECTED_SUBGROUPS,
  AFFECTED_SYSTEMS,
  POLARITY_OVERRIDE_SIGNAL_TYPES,
  AFFECTED_SYSTEM_SIGNAL_TYPES,
  EQUITY_RELEVANT_TYPES,
  INTENSITY_WEIGHT,
} from './signalInstanceSchema.js';

// ─── Deterministic scoring (v5) ─────────────────────────────────────────────

const INTENSITY_ORDER = { light: 0, moderate: 1, severe: 2 };

/** Clamp intensity key up to catalog floor when set. */
function effectiveIntensityKey(signal, signalType) {
  const key = signal.intensity ?? 'moderate';
  const priors = getScoringPriors(signalType);
  const floor = priors.intensity_floor;
  if (!floor || INTENSITY_ORDER[key] == null || INTENSITY_ORDER[floor] == null) return key;
  return INTENSITY_ORDER[key] >= INTENSITY_ORDER[floor] ? key : floor;
}

/** Half-life decay from article_date (YYYY-MM-DD) or batch_report_date on signal. */
function temporalDecayMultiplier(signal, priors) {
  const halfLife = priors.temporal_half_life_days;
  if (halfLife == null || halfLife <= 0) return 1;
  const ref = signal.batch_report_date ?? signal.report_date;
  const articleDate = signal.article_date;
  if (!ref || !articleDate) return 1;
  const refMs = Date.parse(ref);
  const artMs = Date.parse(articleDate);
  if (!Number.isFinite(refMs) || !Number.isFinite(artMs)) return 1;
  const days = Math.max(0, (refMs - artMs) / 86400000);
  return Math.pow(0.5, days / halfLife);
}

export const COMPONENT_IDS = [
  'narrative', 'information_communication', 'lifesaving_behavior',
  'functional_continuity', 'community_capital', 'leadership',
  'belonging_solidarity', 'wellbeing_at_risk',
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
  wellbeing_at_risk:          { tanhK: 2.5, certM: 2.0 },
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

// Outlet posture compounds bias for reported facts and institutional summaries; a
// direct quote from a named person is sourced to the speaker, not the outlet, so
// outlet priors are NOT applied there.
const OUTLET_PRIOR_APPLIES_TO = new Set([
  'observational_reported_fact',
  'named_institutional_fact',
]);

/** Effective component weight after optional instance-level polarity override. */
function effectiveWeightForSignal(signal, signalType, baseWeight) {
  const catalog = getSignalCatalogEntry(signalType);
  if (!catalog || !POLARITY_OVERRIDE_SIGNAL_TYPES.has(signalType)) return baseWeight;
  const override = signal.polarity_override;
  if (override !== 'positive' && override !== 'negative') return baseWeight;
  if (override === catalog.defaultPolarity) return baseWeight;
  return -baseWeight;
}

/** Per-signal contribution before per-source capping (excludes duplicate-article discount). */
function contributionForSignal(signal, baseWeight) {
  const signalType = signal.signal_type ?? signal.type;
  const priors = getScoringPriors(signalType);
  const effectiveWeight = effectiveWeightForSignal(signal, signalType, baseWeight);
  // B2: field reports default to repeated_pattern when scope_level is missing.
  const isField = signal.source_type === 'field';
  const defaultScope = isField ? 'repeated_pattern' : 'single_case';
  const scope = SCOPE_WEIGHT[signal.scope_level ?? defaultScope] ?? SCOPE_WEIGHT[defaultScope];
  const intensityKey = effectiveIntensityKey(signal, signalType);
  const intensity = INTENSITY_WEIGHT[intensityKey] ?? INTENSITY_WEIGHT.moderate;
  const reliabilityKey = signal.evidence_type ?? signal.evidence_class ?? 'observational_reported_fact';
  let reliability = RELIABILITY_WEIGHT[reliabilityKey] ?? RELIABILITY_WEIGHT.observational_reported_fact;
  if (priors.reliability_override?.[reliabilityKey] != null) {
    reliability = priors.reliability_override[reliabilityKey];
  }
  const outletPrior = OUTLET_PRIOR_APPLIES_TO.has(reliabilityKey)
    ? getOutletReliabilityMultiplier(signal.article_source)
    : 1;
  const dualBoostRaw = signal._dual_pass_agreement
    ? Number.parseFloat(process.env.RESILIENCE_DUAL_AGREEMENT_BOOST ?? '1.05')
    : 1;
  const dualBoost = Number.isFinite(dualBoostRaw) ? Math.min(1.2, Math.max(1, dualBoostRaw)) : 1;
  let temporal = signal.temporal_weight ?? 1.0;
  temporal *= temporalDecayMultiplier(signal, priors);
  let phaseFactor = 1;
  if (signal.phase && Array.isArray(priors.expected_phases) && priors.expected_phases.length > 0) {
    if (!priors.expected_phases.includes(signal.phase)) {
      phaseFactor = priors.phase_mismatch_discount ?? 1;
    }
  }
  const extractionConfidence = Math.min(1, Math.max(0, signal.extraction_confidence ?? 1.0));
  return Math.abs(effectiveWeight) * scope * intensity * reliability * outletPrior
    * dualBoost * temporal * phaseFactor * extractionConfidence;
}

/** Log-discounted factor for duplicate signal_type within one article (k = 1-based occurrence). */
function duplicateArticleFactor(k) {
  return (1 + Math.log(k)) / k;
}

function articleKeyForSignal(signal) {
  return String(signal.article_url ?? signal.article_index ?? '_no_article');
}

/** 1-based occurrence index per (article, signal_type) across the batch. */
function buildDuplicateOccurrenceIndex(signals) {
  const counts = new Map();
  const indexBySignal = new WeakMap();
  for (const s of signals) {
    const key = `${articleKeyForSignal(s)}|${s.signal_type ?? s.type}`;
    const k = (counts.get(key) ?? 0) + 1;
    counts.set(key, k);
    indexBySignal.set(s, k);
  }
  return indexBySignal;
}

/**
 * Mass-weighted signal_class mix for one component's contribution items.
 * @param {Array<{ signal: object, contribution: number }>} items
 */
function computeSignalClassMix(items) {
  const mix = {
    behavior: 0,
    attitude: 0,
    structural_state: 0,
    narrative: 0,
    event: 0,
    capacity: 0,
  };
  for (const it of items) {
    const t = it.signal.signal_type ?? it.signal.type;
    const entry = getSignalCatalogEntry(t);
    const cls = entry?.signal_class;
    if (!cls || !(cls in mix)) continue;
    mix[cls] += it.contribution;
  }
  const attitudeMass = mix.attitude;
  mix.behavior_to_attitude_ratio = attitudeMass > 0
    ? round3(mix.behavior / attitudeMass)
    : (mix.behavior > 0 ? null : 0);
  mix.capacity_realized_ratio = mix.capacity > 0
    ? round3(mix.behavior / mix.capacity)
    : (mix.behavior > 0 ? null : 0);
  for (const k of Object.keys(mix)) {
    if (k !== 'behavior_to_attitude_ratio' && k !== 'capacity_realized_ratio') {
      mix[k] = round3(mix[k]);
    }
  }
  return mix;
}

/** Mass by signal_type from capped contribution items. */
function massBySignalType(items) {
  const m = {};
  for (const it of items) {
    const t = it.signal.signal_type ?? it.signal.type;
    if (!t) continue;
    m[t] = (m[t] ?? 0) + it.contribution;
  }
  return m;
}

/**
 * Composite indicators (code-side, not LLM vocabulary).
 * @param {string} componentId
 * @param {Array<{signal: object, contribution: number}>} cappedItems
 * @param {Record<string, number>} [batchMassByType] mass by signal_type across entire batch
 */
function computeDerivedIndicators(componentId, cappedItems, batchMassByType = null) {
  const byType = batchMassByType ?? massBySignalType(cappedItems);
  const out = {
    compliance_paradox: false,
    narrative_wellbeing_dissociation: false,
    leadership_narrative_divergence: false,
    outlet_concentration_warning: false,
    dominant_outlet_key: null,
    trust_information_cascade: false,
    recovery_fragility: false,
    equity_information_double_gap: false,
    capacity_without_behavior: false,
    solidarity_under_harm: false,
  };

  if (componentId === 'lifesaving_behavior') {
    out.compliance_paradox =
      (byType.compliance_enter_shelter ?? 0) > 0 && (byType.information_confusion ?? 0) > 0;
  }
  if (componentId === 'narrative') {
    const posNarr = byType.resilience_narrative_positive ?? 0;
    const distress = (byType.fear_expression ?? 0) + (byType.psychological_distress ?? 0)
      + (byType.child_distress ?? 0);
    out.narrative_wellbeing_dissociation = posNarr > 0 && distress > 0;
  }
  if (componentId === 'wellbeing_at_risk') {
    const posWell = (byType.positive_wellbeing_marker ?? 0) + (byType.calm_confidence ?? 0);
    const distress = (byType.psychological_distress ?? 0) + (byType.child_distress ?? 0)
      + (byType.fear_expression ?? 0);
    out.narrative_wellbeing_dissociation = posWell > 0 && distress > 0;
  }
  if (componentId === 'leadership' || componentId === 'narrative') {
    const posNarr = (byType.resilience_narrative_positive ?? 0) + (byType.calm_confidence ?? 0);
    out.leadership_narrative_divergence =
      posNarr > 0 && (byType.leadership_absence ?? 0) > 0;
  }
  if (componentId === 'lifesaving_behavior' || componentId === 'information_communication') {
    out.trust_information_cascade =
      (byType.mistrusted_information_source ?? 0) > 0
      && (byType.non_compliance_due_to_distrust ?? 0) > 0;
  }
  if (componentId === 'functional_continuity') {
    out.recovery_fragility =
      (byType.post_event_recovery_indicator ?? 0) > 0 && (byType.recovery_setback ?? 0) > 0;
  }
  if (componentId === 'wellbeing_at_risk' || componentId === 'information_communication') {
    out.equity_information_double_gap =
      (byType.information_inclusivity_gap ?? 0) > 0
      && (byType.inequitable_resource_access ?? 0) > 0;
  }
  if (componentId === 'community_capital') {
    const mix = computeSignalClassMix(cappedItems);
    out.capacity_without_behavior =
      (mix.capacity ?? 0) > 0.5 && (mix.behavior ?? 0) < 0.3 * (mix.capacity ?? 0);
  }
  if (componentId === 'belonging_solidarity' || componentId === 'wellbeing_at_risk') {
    out.solidarity_under_harm =
      (byType.harm_to_population ?? 0) > 0 && (byType.solidarity_help_others ?? 0) > 0;
  }

  const outletInfo = detectOutletConcentration(cappedItems, 0.35);
  out.outlet_concentration_warning = outletInfo.warning;
  out.dominant_outlet_key = outletInfo.dominantKey;

  return out;
}

/** Pre-cap check: would article_source cap bind for any polarity? */
function detectOutletConcentration(items, threshold) {
  if (items.length === 0) return { warning: false, dominantKey: null };
  const distinct = new Set(items.map((it) => it.signal.article_source ?? '_unknown'));
  if (distinct.size <= 1) return { warning: false, dominantKey: null };

  for (const polarity of ['+', '-']) {
    const polItems = items.filter((it) => it.polarity === polarity);
    const total = polItems.reduce((s, it) => s + it.contribution, 0);
    if (total === 0) continue;
    const byKey = {};
    for (const it of polItems) {
      const k = it.signal.article_source ?? '_unknown';
      byKey[k] = (byKey[k] || 0) + it.contribution;
    }
    for (const [key, mass] of Object.entries(byKey)) {
      if (mass / total > threshold) {
        return { warning: true, dominantKey: key };
      }
    }
  }
  return { warning: false, dominantKey: null };
}

/** Whether applySourceCap scaled any item (post vs pre cap mass). */
function sourceCapWasApplied(preItems, postItems) {
  if (preItems.length !== postItems.length) return false;
  for (let i = 0; i < preItems.length; i++) {
    if (Math.abs(preItems[i].contribution - postItems[i].contribution) > 1e-6) return true;
  }
  return false;
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

  // Min-mass floor (4f): single thin signal cannot push score outside [3, 8].
  // C7: surface a `floorClamped` flag whenever the floor actually constrains the score so the
  // UI can annotate "thin evidence" rather than silently letting the headline drift toward 5.
  let floorClamped = false;
  if (evidenceMass < 1.5) {
    const clamped = Math.max(3, Math.min(8, score));
    if (clamped !== score) floorClamped = true;
    score = clamped;
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
    floorClamped,
  };
}

/**
 * Bootstrap a 90% confidence interval on the score by resampling contribution
 * items with replacement N times. Per-source cap and floors are applied to each
 * resample so the CI reflects the same model the headline score uses.
 *
 * B6 — CI stability: thin components produce many resamples whose evidence_mass
 * happens to be zero; in that regime the surviving samples bunch tightly and
 * the CI looks artificially tight. We track the fraction of degenerate samples
 * and, when it exceeds 20%, return a widened fallback CI ([score-2, score+2]
 * clamped to [1,10]) plus a `ci_unstable: true` flag so the UI can warn.
 *
 * `currentScore` is the headline score of the component; used as the centre of
 * the fallback CI. When omitted the function falls back to the median of the
 * non-null bootstrap samples.
 */
const CI_UNSTABLE_THRESHOLD = 0.20;

function bootstrapScoreCI(items, componentId, totalArticles, currentScore = null) {
  if (items.length === 0) return { score_low: null, score_high: null, ci_unstable: false };
  const rng = createSeededRng(BOOTSTRAP_SEED ^ items.length);
  const n = items.length;
  const scores = [];
  let nullSamples = 0;
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
    else nullSamples += 1;
  }
  if (scores.length === 0) return { score_low: null, score_high: null, ci_unstable: false };

  scores.sort((a, b) => a - b);
  const pct = (p) => scores[Math.min(scores.length - 1, Math.floor(p * scores.length))];
  const naiveLow = pct(0.05);
  const naiveHigh = pct(0.95);
  const nullFraction = nullSamples / BOOTSTRAP_SAMPLES;

  if (nullFraction > CI_UNSTABLE_THRESHOLD) {
    const centre = currentScore != null ? currentScore : scores[Math.floor(scores.length / 2)];
    return {
      score_low: Math.max(1, centre - 2),
      score_high: Math.min(10, centre + 2),
      ci_unstable: true,
    };
  }
  return { score_low: naiveLow, score_high: naiveHigh, ci_unstable: false };
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
function computeFacets(componentId, allComponentSignals, _totalArticles) {
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
      const signalType = s.signal_type ?? s.type;
      const w = SIGNAL_TO_COMPONENTS[signalType]?.[componentId];
      if (w == null) continue;
      const effectiveW = effectiveWeightForSignal(s, signalType, w);
      const c = contributionForSignal(s, w);
      if (effectiveW >= 0) positive += c;
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
 * v4 scoring model.
 *
 * Per component:
 *   contribution(s,c) = |w_{s,c}| × scope × intensity × reliability × temporal × extraction_confidence
 *                       × duplicate_article_factor (same article + signal_type)
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
  const duplicateIndex = buildDuplicateOccurrenceIndex(signals);

  // Precompute batch-wide type mass (pre-cap) for cross-component derived indicators.
  const batchPreCapItems = [];
  for (const signal of signals) {
    const signalType = signal.signal_type ?? signal.type;
    const mapping = SIGNAL_TO_COMPONENTS[signalType];
    if (!mapping) continue;
    const firstComponent = Object.keys(mapping)[0];
    const baseWeight = mapping[firstComponent];
    const preDuplicate = contributionForSignal(signal, baseWeight);
    const k = duplicateIndex.get(signal) ?? 1;
    batchPreCapItems.push({
      signal,
      contribution: preDuplicate * duplicateArticleFactor(k),
    });
  }
  const batchMassByType = massBySignalType(batchPreCapItems);

  for (const id of COMPONENT_IDS) {
    const items = []; // { signal, contribution, contributionPreDuplicate, polarity }
    const articleSet = new Set();
    const sourceSet = new Set();

    for (const signal of signals) {
      const signalType = signal.signal_type ?? signal.type;
      const mapping = SIGNAL_TO_COMPONENTS[signalType];
      if (!mapping || !(id in mapping)) continue;
      const baseWeight = mapping[id];
      const effectiveWeight = effectiveWeightForSignal(signal, signalType, baseWeight);
      const preDuplicate = contributionForSignal(signal, baseWeight);
      const k = duplicateIndex.get(signal) ?? 1;
      const contribution = preDuplicate * duplicateArticleFactor(k);
      items.push({
        signal,
        contribution,
        contributionPreDuplicate: preDuplicate,
        polarity: effectiveWeight >= 0 ? '+' : '-',
      });

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
        score_low: null, score_high: null, ci_unstable: false, floor_clamped: false,
        counterfactual_article_key: null, counterfactual_delta: null,
        signal_count: 0, distinct_article_count: 0, source_diversity: 0,
        signal_class_mix: computeSignalClassMix([]),
        derived_indicators: computeDerivedIndicators(id, [], batchMassByType),
        source_cap_binding: false,
        signals: [], facets: computeFacets(id, [], totalArticles),
      };
      continue;
    }

    const cappedItems = applySourceCap(items);
    const sourceCapBinding = sourceCapWasApplied(items, cappedItems);
    // Enriched signal copies for downstream UI explainability (N9 + A5): each signal carries
    // BOTH its pre-cap raw contribution (_contribution_raw, used by reviewers to see "what
    // evidence really mattered") and its post-cap final contribution (_contribution, what the
    // math actually used). applySourceCap preserves order, so items[i] zips with cappedItems[i].
    // We emit copies so the same underlying signal can be enriched differently across the
    // multiple components it routes into without cross-contamination.
    const enrichedSignals = cappedItems.map((cappedIt, idx) => ({
      ...cappedIt.signal,
      _contribution: round3(cappedIt.contribution),
      _contribution_raw: round3(items[idx]?.contributionPreDuplicate ?? cappedIt.contribution),
      _weight: effectiveWeightForSignal(
        cappedIt.signal,
        cappedIt.signal.signal_type ?? cappedIt.signal.type,
        SIGNAL_TO_COMPONENTS[cappedIt.signal.signal_type ?? cappedIt.signal.type]?.[id] ?? 0,
      ),
      _polarity: cappedIt.polarity,
    }));
    const sc = scoreFromItems(cappedItems, id, totalArticles, articleSet, sourceSet);
    if (!sc) {
      results[id] = {
        score: null, confidence: 'insufficient_data',
        positive_evidence: 0, negative_evidence: 0, net_evidence: 0, evidence_mass: 0,
        strength: 0, coverage_ratio: 0, dispersion: null, coverage_adjustment: 0,
        source_diversity_factor: 0, type_diversity_factor: 0, signal_type_entropy: 0,
        adjusted_strength: 0, certainty: 0, polarization: 0,
        score_low: null, score_high: null, ci_unstable: false, floor_clamped: false,
        counterfactual_article_key: null, counterfactual_delta: null,
        signal_count: 0, distinct_article_count: 0, source_diversity: 0,
        signal_class_mix: computeSignalClassMix([]),
        derived_indicators: computeDerivedIndicators(id, [], batchMassByType),
        source_cap_binding: false,
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

    const ci = bootstrapScoreCI(items, id, totalArticles, sc.score);
    // A5: counterfactual identifies the dominant article from PRE-cap masses (so the picked
    // article is the one whose evidence really matters), then recomputes the score with the
    // cap reapplied on remaining items inside the helper. This keeps the math cap-bounded
    // while making the explainer faithful to the underlying evidence distribution.
    const cf = counterfactualLargestArticle(items, id, totalArticles, sc.score);

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
      ci_unstable:             ci.ci_unstable === true,
      floor_clamped:           sc.floorClamped === true,
      counterfactual_article_key: cf.counterfactual_article_key,
      counterfactual_delta:    cf.counterfactual_delta,
      signal_count:            enrichedSignals.length,
      distinct_article_count:  distinctArticleCount,
      source_diversity:        sourceSet.size,
      signal_class_mix:        computeSignalClassMix(cappedItems),
      derived_indicators:      computeDerivedIndicators(id, cappedItems, batchMassByType),
      source_cap_binding:      sourceCapBinding,
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
