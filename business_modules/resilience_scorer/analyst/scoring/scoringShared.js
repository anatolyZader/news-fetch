import { COMPONENT_FACETS } from '../../../../business_modules/resilience_scorer/domain/services/operator/componentFacets.js';
import {
  SIGNAL_TO_COMPONENTS,
  getSignalCatalogEntry,
} from '../../../../business_modules/resilience_scorer/domain/services/signals/signalRouter.js';
import { evaluateHighSalienceBypass } from '../../../../business_modules/resilience_scorer/domain/epistemic/highSalienceBypass.js';

export { COMPONENT_IDS } from '../../../../cross-cut-modules/resilience-contracts/componentIds.js';
export {
  RELIABILITY_WEIGHT,
  buildDuplicateOccurrenceIndex,
  duplicateArticleFactor, contributionForSignal, effectiveWeightForSignal, round3,
} from '../../../../business_modules/resilience_scorer/domain/epistemic/massContribution.js';
export { sourceCapWasApplied } from '../../../../business_modules/resilience_scorer/domain/epistemic/evidenceCaps.js';
import {
  contributionForSignal,
  effectiveWeightForSignal,
  round3,
} from '../../../../business_modules/resilience_scorer/domain/epistemic/massContribution.js';


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

export const DEFAULT_TUNING = { tanhK: 2.5, certM: 2 };

export const BOOTSTRAP_SAMPLES = 200;
export const BOOTSTRAP_SEED = 0x9e3779b1;

export function tuningFor(componentId, tuningTable) {
  const table = tuningTable ?? COMPONENT_TUNING;
  return table[componentId] ?? DEFAULT_TUNING;
}

/** Minimal deterministic LCG so bootstrap CIs are stable across runs/tests. */
export function createSeededRng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
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

/**
 * Pure component score from contribution items (no high-salience bypass).
 */
export function scoreFromItems(items, componentId, totalArticles, articleSet, sourceSet, opts = {}) {
  const { positive, negative, evidenceMass } = sumPolarityMass(items);
  if (evidenceMass === 0) return null;

  const netEvidence = positive - negative;
  const tuning = tuningFor(componentId, opts.tuningTable);
  const strength = Math.tanh(netEvidence / tuning.tanhK);

  const { coverageRatio, coverageAdjustment, sourceDiversityFactor } =
    computeCoverageFactors(totalArticles, articleSet, sourceSet);
  const { typeDiversityFactor, signalTypeEntropy } = computeTypeDiversity(items);

  const adjustedStrength = strength * coverageAdjustment * sourceDiversityFactor * typeDiversityFactor;
  const rawScore = Math.round(5.5 + 4.5 * adjustedStrength);
  const score = Math.max(1, Math.min(10, rawScore));

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
  };
}

/**
 * Post-scoring policy: high-salience bypass metadata.
 * Min-mass [3,8] floor removed — thin evidence shows raw scores; `floorClamped`
 * is kept always-false for report-field compatibility.
 * @param {ReturnType<typeof scoreFromItems>} base
 */
export function applySaliencePostScoringPolicy(base, items, opts = {}) {
  if (!base) return null;
  const salienceBypass = evaluateHighSalienceBypass(
    items,
    base.evidenceMass,
    base.score,
    opts.salienceContext ?? {},
  );
  return {
    ...base,
    floorClamped: false,
    floorBypassed: salienceBypass.skipFloor === true,
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
  const sc = applySaliencePostScoringPolicy(
    scoreFromItems(capped, componentId, totalArticles, articleSet, sourceSet),
    capped,
  );
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
