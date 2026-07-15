/**
 * Operator-side signal mass (contribution) — shared with diagnostics and caps.
 */
import { getOutletReliabilityMultiplier } from '../services/outlets/outletReliabilityPriors.js';
import { getScoringPriors, getSignalCatalogEntry, getRoutingRole } from '../services/signals/signalRouter.js';
import {
  INTENSITY_WEIGHT,
  POLARITY_OVERRIDE_SIGNAL_TYPES,
} from '../services/signals/signalInstanceSchema.js';
import { groundingWeightMultiplier } from '../services/signals/groundingPolicy.js';
import { applyFieldGeoDiscount, isFieldFamilySource } from '../services/signals/fieldSignalPolicy.js';
import { gamingContributionMultiplier } from '../services/signals/signalGamingPolicy.js';
import { SIGNAL_PROVENANCE } from '../services/signals/evidenceEligibility.js';

const INTENSITY_ORDER = { light: 0, moderate: 1, severe: 2 };

const SCOPE_WEIGHT = {
  single_case: 0.35,
  repeated_pattern: 0.65,
  quantified_or_broad: 1,
};

export const RELIABILITY_WEIGHT = {
  direct_quote_named_person: 1,
  named_survey_statistic: 0.95,
  named_institutional_fact: 0.9,
  observational_reported_fact: 0.75,
  direct_evidence: 0.9,
  observational_evidence: 0.75,
};

const FIELD_SOURCE_TYPES = new Set(['field', 'visits', 'field_whatsapp', 'pbo', 'pbo_regional', 'naftali']);
const PRESS_SOURCE_TYPES = new Set(['news', 'radio']);

const OUTLET_PRIOR_APPLIES_TO = new Set([
  'observational_reported_fact',
  'named_institutional_fact',
]);

function fieldSourceMultiplier() {
  const raw = Number.parseFloat(process.env.RESILIENCE_FIELD_SOURCE_MULTIPLIER ?? '1.3');
  return Number.isFinite(raw) && raw > 0 ? raw : 1.3;
}

function partialVoidPressMultiplier(signal) {
  if (signal?.partial_void_press !== true) return 1;
  const raw = Number.parseFloat(process.env.RESILIENCE_PARTIAL_VOID_PRESS_WEIGHT ?? '0.5');
  return Number.isFinite(raw) && raw > 0 ? raw : 0.5;
}

function isGeoVerifiedPress(signal) {
  if (!PRESS_SOURCE_TYPES.has(signal?.source_type)) return false;
  if (signal?.signalProvenance === SIGNAL_PROVENANCE.verified_geo) return true;
  const g = signal?.geo;
  if (g?.kind !== 'resolved') return false;
  const geoProv = g?.resolution?.provenance;
  if (geoProv === 'text_inferred') return false;
  const usable = g?.policy?.usableForMetrics ?? g?.usableForMetrics;
  return usable !== false;
}

function defaultScopeLevel(signal) {
  const isField = signal.source_type === 'field' || signal.source_type === 'visits' || signal.source_type === 'field_whatsapp';
  if (isField || isFieldFamilySource(signal)) return 'repeated_pattern';
  if (isGeoVerifiedPress(signal)) return 'repeated_pattern';
  return 'single_case';
}

function effectiveIntensityKey(signal, signalType) {
  const key = signal.intensity ?? 'moderate';
  const priors = getScoringPriors(signalType);
  const floor = priors.intensity_floor;
  if (floor && INTENSITY_ORDER[key] != null && INTENSITY_ORDER[floor] != null) {
    return INTENSITY_ORDER[key] >= INTENSITY_ORDER[floor] ? key : floor;
  }
  return key;
}

export function round3(n) {
  return Math.round(n * 1000) / 1000;
}

const INFERRED_ROUTE_DISCOUNT_DEFAULT = 0.5;

function inferredRouteDiscount() {
  const raw = Number.parseFloat(
    process.env.RESILIENCE_INFERRED_ROUTE_DISCOUNT ?? String(INFERRED_ROUTE_DISCOUNT_DEFAULT),
  );
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : INFERRED_ROUTE_DISCOUNT_DEFAULT;
}

/**
 * Base routing weight after the inferred-route discount: 'inferred' edges are
 * causal associations, not direct observations, and must not carry the same
 * evidence mass as primary edges (see SIGNAL_ROUTING_ROLES in the contracts).
 * @param {string} signalType
 * @param {string} componentId
 * @param {number} baseWeight
 */
export function routedBaseWeight(signalType, componentId, baseWeight) {
  if (getRoutingRole(signalType, componentId) === 'primary') return baseWeight;
  return baseWeight * inferredRouteDiscount();
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

function dualAgreementBoost(signal) {
  const dualVetoOn = process.env.RESILIENCE_SECOND_EXTRACT === '1'
    && process.env.RESILIENCE_DUAL_REQUIRE_AGREEMENT !== '0';
  if (dualVetoOn || !signal._dual_pass_agreement) return 1;
  const dualBoostRaw = Number.parseFloat(process.env.RESILIENCE_DUAL_AGREEMENT_BOOST ?? '1.05');
  return Number.isFinite(dualBoostRaw) ? Math.min(1.2, Math.max(1, dualBoostRaw)) : 1;
}

function phaseMismatchFactor(signal, priors) {
  if (!signal.phase || !Array.isArray(priors.expected_phases) || priors.expected_phases.length === 0) {
    return 1;
  }
  return priors.expected_phases.includes(signal.phase)
    ? 1
    : (priors.phase_mismatch_discount ?? 1);
}

function applyOpenEvidenceSyntheticDiscount(signal, contribution) {
  if (signal.open_evidence_synthetic !== true) return contribution;
  const w = Number.isFinite(signal.open_score_weight)
    ? signal.open_score_weight
    : Number.parseFloat(process.env.RESILIENCE_OPEN_EVIDENCE_SCORE_WEIGHT ?? '0.4');
  return contribution * (Number.isFinite(w) && w > 0 ? w : 0.4);
}

function applyOovSyntheticDiscount(signal, contribution) {
  if (signal.oov_synthetic !== true) return contribution;
  const w = Number.isFinite(signal.oov_score_weight)
    ? signal.oov_score_weight
    : Number.parseFloat(process.env.RESILIENCE_OOV_SCORE_WEIGHT ?? '0.4');
  return contribution * (Number.isFinite(w) && w > 0 ? w : 0.4);
}

/** Per-signal contribution before per-source capping (excludes duplicate-article discount). */
export function contributionForSignal(signal, baseWeight) {
  const signalType = signal.signal_type ?? signal.type;
  const priors = getScoringPriors(signalType);
  const effectiveWeight = effectiveWeightForSignal(signal, signalType, baseWeight);
  const defaultScope = defaultScopeLevel(signal);
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
  let temporal = signal.temporal_weight ?? 1;
  const halfLife = priors.temporal_half_life_days;
  if (halfLife != null && halfLife > 0) {
    const ref = signal.batch_report_date ?? signal.report_date;
    const articleDate = signal.article_date;
    if (ref && articleDate) {
      const refMs = Date.parse(ref);
      const artMs = Date.parse(articleDate);
      if (Number.isFinite(refMs) && Number.isFinite(artMs)) {
        const days = Math.max(0, (refMs - artMs) / 86400000);
        temporal *= 0.5 ** (days / halfLife);
      }
    }
  }
  const extractionConfidence = Math.min(1, Math.max(0, signal.extraction_confidence ?? 1));
  const groundingFactor = groundingWeightMultiplier(signal.grounding_tier);
  const fieldMult = FIELD_SOURCE_TYPES.has(signal.source_type) ? fieldSourceMultiplier() : 1;
  let contribution = Math.abs(effectiveWeight) * scope * intensity * reliability * outletPrior
    * dualAgreementBoost(signal) * temporal * phaseMismatchFactor(signal, priors)
    * extractionConfidence * groundingFactor * fieldMult;
  contribution *= gamingContributionMultiplier(signal);
  contribution *= partialVoidPressMultiplier(signal);
  contribution = applyFieldGeoDiscount(signal, contribution);
  return applyOpenEvidenceSyntheticDiscount(signal, applyOovSyntheticDiscount(signal, contribution));
}

export function duplicateArticleFactor(k) {
  return (1 + Math.log(k)) / k;
}

export function articleKeyForSignal(signal) {
  return String(signal.article_url ?? signal.article_index ?? '_no_article');
}

const PBO_SOURCE_TYPES = new Set(['pbo', 'pbo_regional']);

function duplicateKeyForSignal(signal) {
  const articleKey = articleKeyForSignal(signal);
  const signalType = signal.signal_type ?? signal.type ?? '_unknown';
  if (PBO_SOURCE_TYPES.has(signal?.source_type)) {
    return articleKey;
  }
  return `${articleKey}|${signalType}`;
}

export function buildDuplicateOccurrenceIndex(signals) {
  const counts = new Map();
  const indexBySignal = new WeakMap();
  for (const s of signals) {
    const key = duplicateKeyForSignal(s);
    const k = (counts.get(key) ?? 0) + 1;
    counts.set(key, k);
    indexBySignal.set(s, k);
  }
  return indexBySignal;
}
