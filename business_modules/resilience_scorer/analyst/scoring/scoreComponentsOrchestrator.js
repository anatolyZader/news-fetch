import { metricsEligible } from '../../../../business_modules/resilience_scorer/domain/services/signals/evidenceEligibility.js';
import { applySourceCap } from '../../../../business_modules/resilience_scorer/domain/epistemic/evidenceCaps.js';
import { bootstrapScoreCI } from './bootstrapScoreCI.js';
import { computeDerivedIndicators } from './derivedIndicators.js';
import {
  buildBatchPreCapMassByType,
  collectComponentItems,
} from './scoreSingleComponent.js';
import {
  COMPONENT_IDS,
  buildDuplicateOccurrenceIndex,
  computeFacets,
  computeSignalClassMix,
  counterfactualLargestArticle,
  coverageDispersion,
  effectiveWeightForSignal,
  round3,
  scoreFromItems,
  applySaliencePostScoringPolicy,
  sourceCapWasApplied,
  tuningFor,
} from './scoringShared.js';
import {
  defaultComponentTuning,
  defaultSignalWeights,
  resolveComponentTuning,
  resolveSignalWeights,
} from './scoringOverrides.js';
import { evaluatePresenceGates } from '../../../../business_modules/resilience_scorer/domain/epistemic/presenceGates.js';

const PRESS_SOURCE_TYPES = new Set(['news', 'radio']);

function insufficientDataResult(componentId, batchMassByType, totalArticles) {
  return {
    score: null, confidence: 'insufficient_data',
    positive_evidence: 0, negative_evidence: 0, net_evidence: 0, evidence_mass: 0,
    strength: 0, coverage_ratio: 0, dispersion: null, coverage_adjustment: 0,
    source_diversity_factor: 0, type_diversity_factor: 0, signal_type_entropy: 0,
    adjusted_strength: 0, certainty: 0, polarization: 0,
    score_low: null, score_high: null, ci_unstable: false, floor_clamped: false,
    floor_bypassed: false, salience_critical: false, salience_bypass_reasons: [],
    counterfactual_article_key: null, counterfactual_delta: null,
    signal_count: 0, distinct_article_count: 0, source_diversity: 0,
    signal_class_mix: computeSignalClassMix([]),
    derived_indicators: computeDerivedIndicators(componentId, [], batchMassByType),
    source_cap_binding: false,
    signals: [], facets: computeFacets(componentId, [], totalArticles),
  };
}

/** Pre-dedup press-only mention mass per component (information environment metric). */
function computeMediaMentionMass(allSignals, signalWeights) {
  const byComp = Object.fromEntries(COMPONENT_IDS.map((id) => [id, 0]));
  for (const signal of allSignals ?? []) {
    if (PRESS_SOURCE_TYPES.has(signal?.source_type) === false) continue;
    const signalType = signal.signal_type ?? signal.type;
    const mapping = signalWeights[signalType];
    if (mapping == null) continue;
    for (const [compId, w] of Object.entries(mapping)) {
      if (compId in byComp) {
        byComp[compId] += Math.abs(w) * (signal.extraction_confidence ?? 0.85);
      }
    }
  }
  return byComp;
}

function assignConfidence(certainty, distinctArticleCount) {
  if (certainty < 0.35 || distinctArticleCount === 1) return 'low';
  if (certainty < 0.7 || distinctArticleCount < 4) return 'medium';
  return 'high';
}

function computeSuppressionBreakdown(scRaw, sc) {
  return {
    source_cap: (scRaw?.score != null && sc?.score != null)
      ? sc.score - scRaw.score
      : null,
    min_mass_floor: null,
  };
}

function buildComponentScoreResult({
  id,
  items,
  cappedItems,
  scRaw,
  sc,
  batchMassByType,
  totalArticles,
  articleSet,
  sourceSet,
  enrichedSignals,
  sourceCapBinding,
  tuningTable,
  capOpts,
}) {
  const scoreRaw = scRaw?.score ?? null;
  const scoreHeadline = sc?.score ?? null;
  const suppressionDelta = (scoreRaw != null && scoreHeadline != null)
    ? scoreRaw - scoreHeadline
    : null;

  const tuning = tuningFor(id, tuningTable);
  const certainty = 1 - Math.exp(-sc.evidenceMass / tuning.certM);
  const polarization = sc.evidenceMass > 0
    ? 1 - Math.abs(sc.netEvidence) / sc.evidenceMass
    : 0;
  const dispersion = coverageDispersion(sc.coverageRatio);
  const distinctArticleCount = articleSet.size;
  const confidence = assignConfidence(certainty, distinctArticleCount);
  const ci = bootstrapScoreCI(items, id, totalArticles, sc.score, capOpts);
  const cf = counterfactualLargestArticle(
    items,
    id,
    totalArticles,
    sc.score,
    (its) => applySourceCap(its, capOpts),
  );

  const presence = evaluatePresenceGates(id, cappedItems);

  return {
    score: sc.score,
    score_raw: scoreRaw,
    score_headline: scoreHeadline,
    suppression_delta: suppressionDelta,
    suppression_breakdown: computeSuppressionBreakdown(scRaw, sc),
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
    floor_bypassed:          sc.floorBypassed === true,
    salience_critical:       sc.salienceCritical === true,
    salience_bypass_reasons: sc.salienceBypassReasons ?? [],
    salience_dominant_signal_type: sc.salienceDominantSignalType ?? null,
    presence_gate_triggered: presence.triggered === true,
    presence_gate: presence.triggered
      ? { rule_id: presence.rule_id, signal_type: presence.signal_type }
      : null,
    operator_status: presence.triggered ? 'critical_failure' : null,
    counterfactual_article_key: cf.counterfactual_article_key,
    counterfactual_delta:    cf.counterfactual_delta,
    counterfactual_no_caps:  scoreRaw,
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

function scoreSingleComponent({
  id,
  collected,
  batchMassByType,
  totalArticles,
  salienceContext,
  signalWeights,
  tuningTable,
  capOpts,
}) {
  const { items, articleSet, sourceSet } = collected;

  if (items.length === 0) {
    return insufficientDataResult(id, batchMassByType, totalArticles);
  }

  const cappedItems = applySourceCap(items, capOpts);
  const sourceCapBinding = sourceCapWasApplied(items, cappedItems);
  const scoreOpts = { salienceContext, tuningTable };
  const scRaw = applySaliencePostScoringPolicy(
    scoreFromItems(items, id, totalArticles, articleSet, sourceSet, scoreOpts),
    items,
    scoreOpts,
  );
  const sc = applySaliencePostScoringPolicy(
    scoreFromItems(cappedItems, id, totalArticles, articleSet, sourceSet, scoreOpts),
    cappedItems,
    scoreOpts,
  );
  const enrichedSignals = enrichCappedSignals(cappedItems, items, id, signalWeights);

  if (sc == null) {
    return insufficientDataResult(id, batchMassByType, totalArticles);
  }

  return buildComponentScoreResult({
    id,
    items,
    cappedItems,
    scRaw,
    sc,
    batchMassByType,
    totalArticles,
    articleSet,
    sourceSet,
    enrichedSignals,
    sourceCapBinding,
    tuningTable,
    capOpts,
  });
}

function enrichCappedSignals(cappedItems, items, componentId, signalWeights) {
  return cappedItems.map((cappedIt, idx) => {
    let capScaleFactor = 1;
    if (cappedIt._cap_scale_factor != null) {
      capScaleFactor = round3(cappedIt._cap_scale_factor);
    }
    const signalType = cappedIt.signal.signal_type ?? cappedIt.signal.type;
    return {
      ...cappedIt.signal,
      _contribution: round3(cappedIt.contribution),
      _contribution_pre_cap: round3(items[idx]?.contribution ?? cappedIt.contribution),
      _contribution_raw: round3(items[idx]?.contributionPreDuplicate ?? cappedIt.contribution),
      _cap_scale_factor: capScaleFactor,
      _cap_layer: cappedIt._cap_layer ?? null,
      _weight: effectiveWeightForSignal(
        cappedIt.signal,
        signalType,
        signalWeights[signalType]?.[componentId] ?? 0,
      ),
      _polarity: cappedIt.polarity,
    };
  });
}

/**
 * v4 scoring model — orchestrates per-component collection, caps, scoring, CI, and facets.
 *
 * @param {Array}  signals
 * @param {object} opts
 * @param {number} opts.totalArticles
 * @param {object} [opts.weightOverlay]
 * @param {object} [opts.tuningOverlay]
 * @returns {Object}
 */
export function scoreComponents(signals, {
  totalArticles = 0,
  epistemicGeoV2,
  mediaSignals = null,
  salienceContext = null,
  weightOverlay = null,
  tuningOverlay = null,
} = {}) {
  const signalWeights = resolveSignalWeights(defaultSignalWeights(), weightOverlay);
  const tuningTable = resolveComponentTuning(defaultComponentTuning(), tuningOverlay);

  const results = {};
  const duplicateIndex = buildDuplicateOccurrenceIndex(signals);

  const scoringSignals = (signals ?? []).filter((s) => {
    if (s?.metricsEligible === false) return false;
    if (s?.metricsEligible === true) return true;
    return metricsEligible(s, { epistemicGeoV2 });
  });

  const batchMassByType = buildBatchPreCapMassByType(scoringSignals, duplicateIndex, signalWeights);

  // Pre-cap mass across all components — enables adaptive cap relaxation on sparse data
  // (same semantics as computeEpistemicProfile's totalEvidenceMass).
  const allComponentItems = COMPONENT_IDS.map((id) =>
    collectComponentItems(id, scoringSignals, duplicateIndex, signalWeights));
  const totalEvidenceMass = allComponentItems.reduce(
    (sum, { items }) => sum + items.reduce((s, it) => s + (it.contribution ?? 0), 0),
    0,
  );
  const capOpts = { totalEvidenceMass };

  for (let i = 0; i < COMPONENT_IDS.length; i++) {
    const id = COMPONENT_IDS[i];
    results[id] = scoreSingleComponent({
      id,
      collected: allComponentItems[i],
      batchMassByType,
      totalArticles,
      salienceContext,
      signalWeights,
      tuningTable,
      capOpts,
    });
  }

  const mediaMass = computeMediaMentionMass(mediaSignals ?? signals, signalWeights);

  for (const id of COMPONENT_IDS) {
    if (results[id]) {
      results[id].media_mention_mass = round3(mediaMass[id] ?? 0);
    }
  }

  return results;
}

export { COMPONENT_TUNING } from './scoringShared.js';
export { resolveSignalWeights, resolveComponentTuning } from './scoringOverrides.js';
