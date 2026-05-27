import { COMPONENT_FACETS } from '../componentFacets.js';
import { getOutletReliabilityMultiplier } from '../outletReliabilityPriors.js';
import {
  SIGNAL_TO_COMPONENTS,
  getScoringPriors,
  getSignalCatalogEntry,
} from '../signalCatalog.js';
import {
  INTENSITY_WEIGHT,
  POLARITY_OVERRIDE_SIGNAL_TYPES,
} from '../signalInstanceSchema.js';
import { evaluateHighSalienceBypass } from '../highSalienceBypass.js';
import { groundingWeightMultiplier } from '../groundingPolicy.js';
import { applyFieldGeoDiscount, isFieldFamilySource } from '../fieldSignalPolicy.js';

export const COMPONENT_IDS = [
  'narrative', 'information_communication', 'lifesaving_behavior',
  'functional_continuity', 'community_capital', 'leadership',
  'belonging_solidarity', 'wellbeing_at_risk',
];

export const RELIABILITY_WEIGHT = {
  direct_quote_named_person:   1,
  named_survey_statistic:      0.95,
  named_institutional_fact:    0.9,
  observational_reported_fact: 0.75,
  direct_evidence:             0.9,
  observational_evidence:      0.75,
};

export const COMPONENT_TUNING = {
  narrative:                 { tanhK: 1.8, certM: 1.4 },
  information_communication: { tanhK: 2.5, certM: 2 },
  lifesaving_behavior:       { tanhK: 3.2, certM: 2.6 },
  functional_continuity:     { tanhK: 2.5, certM: 2 },
  community_capital:         { tanhK: 2.2, certM: 1.8 },
  leadership:                { tanhK: 2.2, certM: 1.8 },
  belonging_solidarity:      { tanhK: 1.8, certM: 1.4 },
  wellbeing_at_risk:          { tanhK: 2.5, certM: 2 },
};

const INTENSITY_ORDER = { light: 0, moderate: 1, severe: 2 };

const SCOPE_WEIGHT = {
  single_case:         0.35,
  repeated_pattern:    0.65,
  quantified_or_broad: 1,
};

export const DEFAULT_TUNING = { tanhK: 2.5, certM: 2 };

export const BOOTSTRAP_SAMPLES = 200;
export const BOOTSTRAP_SEED = 0x9e3779b1;

const FIELD_SOURCE_TYPES = new Set(['field', 'field_whatsapp', 'pbo', 'pbo_regional', 'naftali']);

function fieldSourceMultiplier() {
  const raw = Number.parseFloat(process.env.RESILIENCE_FIELD_SOURCE_MULTIPLIER ?? '1.5');
  return Number.isFinite(raw) && raw > 0 ? raw : 1.5;
}

const OUTLET_PRIOR_APPLIES_TO = new Set([
  'observational_reported_fact',
  'named_institutional_fact',
]);

/** Clamp intensity key up to catalog floor when set. */
function effectiveIntensityKey(signal, signalType) {
  const key = signal.intensity ?? 'moderate';
  const priors = getScoringPriors(signalType);
  const floor = priors.intensity_floor;
  if (floor && INTENSITY_ORDER[key] != null && INTENSITY_ORDER[floor] != null) {
    return INTENSITY_ORDER[key] >= INTENSITY_ORDER[floor] ? key : floor;
  }
  return key;
}

/** Half-life decay from article_date (YYYY-MM-DD) or batch_report_date on signal. */
function temporalDecayMultiplier(signal, priors) {
  const halfLife = priors.temporal_half_life_days;
  if (halfLife == null || halfLife <= 0) return 1;
  const ref = signal.batch_report_date ?? signal.report_date;
  const articleDate = signal.article_date;
  if (ref && articleDate) {
    const refMs = Date.parse(ref);
    const artMs = Date.parse(articleDate);
    if (Number.isFinite(refMs) && Number.isFinite(artMs)) {
      const days = Math.max(0, (refMs - artMs) / 86400000);
      return Math.pow(0.5, days / halfLife);
    }
  }
  return 1;
}

export function tuningFor(componentId) {
  return COMPONENT_TUNING[componentId] ?? DEFAULT_TUNING;
}

export function round3(n) { return Math.round(n * 1000) / 1000; }

/** Minimal deterministic LCG so bootstrap CIs are stable across runs/tests. */
export function createSeededRng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Effective component weight after optional instance-level polarity override. */
export function effectiveWeightForSignal(signal, signalType, baseWeight) {
  const catalog = getSignalCatalogEntry(signalType);
  if (catalog && POLARITY_OVERRIDE_SIGNAL_TYPES.has(signalType)) {
    const override = signal.polarity_override;
    if (override === 'positive' || override === 'negative') {
      if (override !== catalog.defaultPolarity) return -baseWeight;
    }
  }
  return baseWeight;
}

/** Per-signal contribution before per-source capping (excludes duplicate-article discount). */
export function contributionForSignal(signal, baseWeight) {
  const signalType = signal.signal_type ?? signal.type;
  const priors = getScoringPriors(signalType);
  const effectiveWeight = effectiveWeightForSignal(signal, signalType, baseWeight);
  const isField = signal.source_type === 'field' || signal.source_type === 'field_whatsapp';
  const defaultScope = isField || isFieldFamilySource(signal) ? 'repeated_pattern' : 'single_case';
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
  let temporal = signal.temporal_weight ?? 1;
  temporal *= temporalDecayMultiplier(signal, priors);
  let phaseFactor = 1;
  if (signal.phase && Array.isArray(priors.expected_phases) && priors.expected_phases.length > 0) {
    if (priors.expected_phases.includes(signal.phase) === false) {
      phaseFactor = priors.phase_mismatch_discount ?? 1;
    }
  }
  const extractionConfidence = Math.min(1, Math.max(0, signal.extraction_confidence ?? 1));
  const groundingFactor = groundingWeightMultiplier(signal.grounding_tier);
  const fieldMult = FIELD_SOURCE_TYPES.has(signal.source_type) ? fieldSourceMultiplier() : 1;
  let contribution = Math.abs(effectiveWeight) * scope * intensity * reliability * outletPrior
    * dualBoost * temporal * phaseFactor * extractionConfidence * groundingFactor * fieldMult;
  contribution = applyFieldGeoDiscount(signal, contribution);
  return contribution;
}

/** Log-discounted factor for duplicate signal_type within one article (k = 1-based occurrence). */
export function duplicateArticleFactor(k) {
  return (1 + Math.log(k)) / k;
}

export function articleKeyForSignal(signal) {
  return String(signal.article_url ?? signal.article_index ?? '_no_article');
}

/** 1-based occurrence index per (article, signal_type) across the batch. */
export function buildDuplicateOccurrenceIndex(signals) {
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
export function computeSignalClassMix(items) {
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
    if (cls && cls in mix) {
      mix[cls] += it.contribution;
    }
  }
  const attitudeMass = mix.attitude;
  if (attitudeMass > 0) {
    mix.behavior_to_attitude_ratio = round3(mix.behavior / attitudeMass);
  } else if (mix.behavior > 0) {
    mix.behavior_to_attitude_ratio = null;
  } else {
    mix.behavior_to_attitude_ratio = 0;
  }
  if (mix.capacity > 0) {
    mix.capacity_realized_ratio = round3(mix.behavior / mix.capacity);
  } else if (mix.behavior > 0) {
    mix.capacity_realized_ratio = null;
  } else {
    mix.capacity_realized_ratio = 0;
  }
  for (const k of Object.keys(mix)) {
    if (k !== 'behavior_to_attitude_ratio' && k !== 'capacity_realized_ratio') {
      mix[k] = round3(mix[k]);
    }
  }
  return mix;
}

/** Mass by signal_type from capped contribution items. */
export function massBySignalType(items) {
  const m = {};
  for (const it of items) {
    const t = it.signal.signal_type ?? it.signal.type;
    if (t) {
      m[t] = (m[t] ?? 0) + it.contribution;
    }
  }
  return m;
}

/** Whether applySourceCap scaled any item (post vs pre cap mass). */
export function sourceCapWasApplied(preItems, postItems) {
  if (preItems.length !== postItems.length) return false;
  for (let i = 0; i < preItems.length; i++) {
    if (Math.abs(preItems[i].contribution - postItems[i].contribution) > 1e-6) return true;
  }
  return false;
}

/** Shannon entropy in nats over a count map. */
function shannonEntropy(counts) {
  const total = Object.values(counts).reduce((s, c) => s + c, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const c of Object.values(counts)) {
    if (c > 0) {
      const p = c / total;
      h -= p * Math.log(p);
    }
  }
  return h;
}

function countByType(signals) {
  const m = {};
  for (const s of signals) {
    const t = s.signal_type ?? s.type;
    if (t) {
      m[t] = (m[t] || 0) + 1;
    }
  }
  return m;
}

function sumPolarityMass(items) {
  let positive = 0;
  let negative = 0;
  for (const it of items) {
    if (it.polarity === '+') positive += it.contribution;
    else negative += it.contribution;
  }
  return { positive, negative, evidenceMass: positive + negative };
}

function computeCoverageFactors(totalArticles, articleSet, sourceSet) {
  const distinctArticleCount = articleSet.size;
  const coverageRatio = totalArticles > 0 ? distinctArticleCount / totalArticles : 0;
  const coverageAdjustment = 0.7 + 0.3 * Math.sqrt(coverageRatio);
  const sourceDiversityFactor =
    0.85 + 0.15 * Math.min(1, Math.max(0, sourceSet.size - 1) / 3);
  return { coverageRatio, coverageAdjustment, sourceDiversityFactor };
}

function computeTypeDiversity(items) {
  const typeCounts = countByType(items.map((it) => it.signal));
  const distinctTypes = Object.keys(typeCounts).length;
  const H = shannonEntropy(typeCounts);
  const Hmax = Math.log(Math.max(1, distinctTypes));
  const typeDiversityFactor = 0.9 + 0.1 * (Hmax > 0 ? H / Hmax : 0);
  return { typeDiversityFactor, signalTypeEntropy: Hmax > 0 ? H / Hmax : 0 };
}

function applyThinEvidenceFloor(score, evidenceMass, applyFloor, salienceBypass) {
  if (applyFloor === false || evidenceMass >= 1.5) {
    return { score, floorClamped: false, floorBypassed: false };
  }
  if (salienceBypass.skipFloor) {
    return { score, floorClamped: false, floorBypassed: true };
  }
  const clamped = Math.max(3, Math.min(8, score));
  return {
    score: clamped,
    floorClamped: clamped !== score,
    floorBypassed: false,
  };
}

/**
 * Compute final 1-10 score for one component from its capped contribution items
 * and pre-computed strength/coverage/diversity factors.
 */
export function scoreFromItems(items, componentId, totalArticles, articleSet, sourceSet, opts = {}) {
  const applyFloor = opts.applyFloor !== false;
  const { positive, negative, evidenceMass } = sumPolarityMass(items);
  if (evidenceMass === 0) return null;

  const netEvidence = positive - negative;
  const tuning = tuningFor(componentId);
  const strength = Math.tanh(netEvidence / tuning.tanhK);

  const { coverageRatio, coverageAdjustment, sourceDiversityFactor } =
    computeCoverageFactors(totalArticles, articleSet, sourceSet);
  const { typeDiversityFactor, signalTypeEntropy } = computeTypeDiversity(items);

  const adjustedStrength = strength * coverageAdjustment * sourceDiversityFactor * typeDiversityFactor;
  const rawScore = Math.round(5.5 + 4.5 * adjustedStrength);
  let score = Math.max(1, Math.min(10, rawScore));

  const salienceBypass = evaluateHighSalienceBypass(
    items,
    evidenceMass,
    score,
    opts.salienceContext ?? {},
  );

  const floorResult = applyThinEvidenceFloor(score, evidenceMass, applyFloor, salienceBypass);
  score = floorResult.score;

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
    signalTypeEntropy,
    adjustedStrength,
    floorClamped: floorResult.floorClamped,
    floorBypassed: floorResult.floorBypassed,
    salienceCritical: salienceBypass.operatorCritical === true,
    salienceBypassReasons: salienceBypass.reasons ?? [],
    salienceDominantSignalType: salienceBypass.dominantSignalType ?? null,
  };
}

/**
 * Counterfactual: removing the single article that contributes the most |mass|
 * to this component, what does the score become?
 */
export function counterfactualLargestArticle(items, componentId, totalArticles, currentScore, applySourceCap) {
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
  const topKey = articleKeys.reduce(
    (a, b) => (massByArticle[a] >= massByArticle[b] ? a : b),
    articleKeys[0],
  );
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
  if (sc) {
    return {
      counterfactual_article_key: topKey,
      counterfactual_delta: sc.score - currentScore,
    };
  }
  return { counterfactual_article_key: topKey, counterfactual_delta: null };
}

/**
 * Compute optional per-component facet sub-scores.
 */
export function computeFacets(componentId, allComponentSignals, _totalArticles) {
  const def = COMPONENT_FACETS[componentId];
  if (def == null) return null;
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

/** Map coverage ratio to dispersion label. */
export function coverageDispersion(coverageRatio) {
  if (coverageRatio < 0.1) return 'very_low';
  if (coverageRatio < 0.3) return 'low';
  if (coverageRatio < 0.6) return 'moderate';
  return 'high';
}
