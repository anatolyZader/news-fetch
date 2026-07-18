/**
 * Probabilistic grounding tiers for evidence verification.
 * Tier C (unverified_critical) contributes zero mass — operator alert only (Option A).
 *
 * @see docs/main_docu_files/RESILIENCE-ENGINE-REFERENCE.md §3 (Epistemic tiers and abstention)
 */

import { GROUNDING_TIER } from '../../contracts/groundingTier.js';
import { CRITICAL_BYPASS_SIGNAL_TYPES } from '../../epistemic/highSalienceBypass.js';



const DEFAULT_WEAK_WEIGHT = 0.35;

/** Minimum entailment/containment score per evidence type (LLM and embedding verifiers). */
export const ENTAILMENT_THRESHOLDS = {
  direct_quote_named_person: 0.7,
  named_survey_statistic: 0.5,
  named_institutional_fact: 0.5,
  observational_reported_fact: 0.4,
};

const DEFAULT_ENTAILMENT_THRESHOLD = 0.4;

/**
 * @param {string | undefined | null} evidenceType
 * @returns {number}
 */
export function entailmentThresholdFor(evidenceType) {
  return ENTAILMENT_THRESHOLDS[evidenceType] ?? DEFAULT_ENTAILMENT_THRESHOLD;
}

export function isGroundingTieredVerifyEnabled() {
  return process.env.RESILIENCE_GROUNDING_TIERED_VERIFY !== '0';
}

export function weakGroundingWeight() {
  const w = Number.parseFloat(process.env.RESILIENCE_GROUNDING_WEAK_WEIGHT ?? String(DEFAULT_WEAK_WEIGHT));
  return Number.isFinite(w) ? Math.min(1, Math.max(0, w)) : DEFAULT_WEAK_WEIGHT;
}

/**
 * @param {object} signal
 * @returns {boolean}
 */
export function isCriticalForGrounding(signal) {
  const type = signal?.signal_type ?? signal?.type;
  return CRITICAL_BYPASS_SIGNAL_TYPES.has(type);
}

/**
 * @param {string | undefined | null} tier
 * @returns {number}
 */
export function groundingWeightMultiplier(tier) {
  if (!isGroundingTieredVerifyEnabled()) return 1;
  switch (tier) {
    case GROUNDING_TIER.grounded:
      return 1;
    case GROUNDING_TIER.weak:
      return weakGroundingWeight();
    case GROUNDING_TIER.unverified_critical:
      return 0;
    default:
      return 1;
  }
}

/**
 * @param {object} signal
 * @param {{ tier: string, reason?: string, method?: string }} meta
 * @returns {object} same signal reference with grounding fields set
 */
export function assignGroundingFields(signal, { tier, reason, method }) {
  if (!signal || typeof signal !== 'object') return signal;
  signal.grounding_tier = tier;
  if (reason != null) signal.grounding_reason = reason;
  if (method != null) signal.grounding_method = method;
  return signal;
}

/**
 * Derive tier when primary verification failed and no rescue succeeded yet.
 *
 * @param {object} signal
 * @param {{ ok?: boolean, reason?: string }} verifyResult
 * @param {{ rescuedBy?: string | null, entailmentPending?: boolean }} [opts]
 * @returns {string}
 */
export function deriveTierFromVerifyFailure(signal, verifyResult, opts = {}) {
  if (opts.entailmentPending) return GROUNDING_TIER.weak;
  if (isCriticalForGrounding(signal)) return GROUNDING_TIER.unverified_critical;
  return GROUNDING_TIER.rejected;
}

/**
 * Map a successful verification result to tier A.
 *
 * @param {{ reason?: string }} verifyResult
 * @param {{ rescuedBy?: string | null }} [opts]
 * @returns {{ tier: string, reason: string, method: string }}
 */
export function groundingMetaFromVerifyPass(verifyResult, opts = {}) {
  if (opts.rescuedBy === 'embedding') {
    return { tier: GROUNDING_TIER.grounded, reason: 'embedding_rescue', method: 'embedding' };
  }
  if (opts.rescuedBy === 'entailment') {
    return { tier: GROUNDING_TIER.grounded, reason: 'entailment_rescue', method: 'entailment' };
  }
  return {
    tier: GROUNDING_TIER.grounded,
    reason: verifyResult?.reason ?? 'verified',
    method: verifyResult?.reason ?? 'containment',
  };
}

/**
 * After entailment fails: weak for non-critical, unverified_critical for critical.
 *
 * @param {object} signal
 * @returns {{ tier: string, reason: string, method: string }}
 */
export function groundingMetaFromEntailmentFail(signal) {
  if (isCriticalForGrounding(signal)) {
    return {
      tier: GROUNDING_TIER.unverified_critical,
      reason: 'entailment_failed_critical',
      method: 'entailment',
    };
  }
  return {
    tier: GROUNDING_TIER.weak,
    reason: 'entailment_failed',
    method: 'entailment',
  };
}

export const UNVERIFIED_CRITICAL_GROUNDING_REASON = 'unverified_critical_grounding';

export {GROUNDING_TIER} from '../../contracts/groundingTier.js';