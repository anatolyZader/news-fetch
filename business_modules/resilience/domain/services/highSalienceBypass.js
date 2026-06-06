/**
 * High-salience bypass (Outlier Bypass) for thin-evidence min-mass floor.
 *
 * Default min-mass floor clamps scores into [3, 8] when evidence_mass < 1.5.
 * Verified, high-stakes single signals may bypass that floor (asymmetric: low
 * scores only) and always surface as operator-visible critical alerts.
 *
 * @see docs/main_docu_files/RESILIENCE-ENGINE-REFERENCE.md §4 (Operator instruments)
 */

import { getSignalCatalogEntry } from './signalCatalog.js';
import {
  GROUNDING_TIER,
  UNVERIFIED_CRITICAL_GROUNDING_REASON,
} from './groundingPolicy.js';

export const MIN_MASS_THRESHOLD = 1.5;
const DOMINANT_SHARE = 0.85;

const HIGH_TRUST_EVIDENCE = new Set([
  'direct_quote_named_person',
  'named_institutional_fact',
  'named_survey_statistic',
  'direct_evidence',
]);

const TRUSTED_SOURCE_TYPES = new Set(['field', 'field_whatsapp', 'pbo']);

/** Curated types where a lone verified report must not be suppressed. */
export const CRITICAL_BYPASS_SIGNAL_TYPES = new Set([
  'harm_to_population',
  'early_warning_system_failure',
  'non_compliance_exit_early',
  'non_compliance_ignore_guidelines',
  'plan_failed_during_event',
  'protective_infrastructure_absent',
  'risk_exposure_behavior',
  'unsafe_gathering',
  'near_miss_reported',
  'panic_behavior',
]);

export function salienceContextFromDataVoid(dataVoid) {
  if (!dataVoid || typeof dataVoid !== 'object') return {};
  return {
    dataVoidLevel: dataVoid.level,
    digitalDarkness: dataVoid.digital_darkness === true,
  };
}

export function isHighSalienceBypassEnabled() {
  return process.env.RESILIENCE_HIGH_SALIENCE_BYPASS !== '0';
}

/**
 * @param {Array<{ contribution: number, signal: object }>} items
 * @returns {{ item: object | null, share: number }}
 */
export function findDominantContributor(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { item: null, share: 0 };
  }
  const total = items.reduce((s, it) => s + Math.abs(it.contribution ?? 0), 0);
  if (total <= 0) return { item: null, share: 0 };

  let best = items[0];
  let bestMass = Math.abs(best.contribution ?? 0);
  for (let i = 1; i < items.length; i++) {
    const m = Math.abs(items[i].contribution ?? 0);
    if (m > bestMass) {
      best = items[i];
      bestMass = m;
    }
  }
  return { item: best, share: bestMass / total };
}

function effectiveScope(signal) {
  if (signal.scope_level) return signal.scope_level;
  return signal.source_type === 'field' || signal.source_type === 'field_whatsapp' ? 'repeated_pattern' : 'single_case';
}

function hasCriticalStakes(signal) {
  const type = signal.signal_type ?? signal.type;
  if (CRITICAL_BYPASS_SIGNAL_TYPES.has(type)) return true;

  const entry = getSignalCatalogEntry(type);
  if (entry?.signal_class !== 'event') return false;

  const intensity = signal.intensity ?? 'moderate';
  if (intensity === 'severe') return true;

  const floor = entry?.scoringPriors?.intensity_floor;
  return floor === 'moderate' || floor === 'severe';
}

/**
 * @param {object} signal
 * @returns {string[]}
 */
function credibilityBoosterReasons(signal) {
  const reasons = [];
  const et = signal.evidence_type ?? signal.evidence_class ?? 'observational_reported_fact';
  if (HIGH_TRUST_EVIDENCE.has(et)) reasons.push('high_trust_evidence');
  if (TRUSTED_SOURCE_TYPES.has(signal.source_type)) reasons.push('trusted_source');
  if (signal._dual_pass_agreement === true) reasons.push('dual_pass_agreement');
  const scope = effectiveScope(signal);
  if (scope === 'repeated_pattern' || scope === 'quantified_or_broad') {
    reasons.push('elevated_scope');
  }
  return reasons;
}

/**
 * @param {Array<{ contribution: number, signal: object }>} items
 * @param {number} evidenceMass
 * @param {number | null | undefined} rawScore — pre-floor headline (post-cap)
 * @param {{ dataVoidLevel?: string, digitalDarkness?: boolean }} [opts]
 * @returns {{
 *   skipFloor: boolean,
 *   operatorCritical: boolean,
 *   reasons: string[],
 *   dominantSignalType: string | null,
 * }}
 */
export function evaluateHighSalienceBypass(items, evidenceMass, rawScore, opts = {}) {
  const empty = {
    skipFloor: false,
    operatorCritical: false,
    reasons: [],
    dominantSignalType: null,
  };

  if (!isHighSalienceBypassEnabled()) return empty;
  if (rawScore == null) return empty;

  const tierCItem = items.find(
    (it) => it?.signal?.grounding_tier === GROUNDING_TIER.unverified_critical
      && hasCriticalStakes(it.signal),
  );
  if (tierCItem?.signal) {
    const reasons = ['critical_signal', UNVERIFIED_CRITICAL_GROUNDING_REASON];
    if (opts?.dataVoidLevel === 'critical' || opts?.digitalDarkness === true) {
      reasons.push('data_void_context');
    }
    return {
      skipFloor: false,
      operatorCritical: true,
      reasons,
      dominantSignalType: tierCItem.signal.signal_type ?? tierCItem.signal.type ?? null,
    };
  }

  if (evidenceMass >= MIN_MASS_THRESHOLD) return empty;

  const { item: dominant, share } = findDominantContributor(items);
  if (!dominant?.signal || share < DOMINANT_SHARE) return empty;

  const signal = dominant.signal;
  if (!hasCriticalStakes(signal)) return empty;

  const boosters = credibilityBoosterReasons(signal);
  if (boosters.length === 0) return empty;

  const reasons = ['critical_signal', ...boosters];
  if (opts?.dataVoidLevel === 'critical' || opts?.digitalDarkness === true) {
    reasons.push('data_void_context');
  }

  const wouldClampLow = rawScore < 3;
  const wouldClampHigh = rawScore > 8;
  // Asymmetric: never bypass upper floor for thin positive hype.
  const skipFloor = wouldClampLow && !wouldClampHigh;

  return {
    skipFloor,
    operatorCritical: true,
    reasons,
    dominantSignalType: signal.signal_type ?? signal.type ?? null,
  };
}
