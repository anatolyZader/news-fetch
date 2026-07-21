/**
 * Evidence-verification grounding tiers (GROUNDING_TIER) and entailment thresholds.
 *
 * Pipeline position: assess — verification stage assigns grounding_tier on each signal instance.
 *
 * Owns: tier assignment helpers, entailment thresholds, critical-signal grounding classification.
 * Does NOT: narrativeGrounding QA (post-hoc prose check), specialist grounding_score, or numeric resilience scores.
 *
 * Key collaborators: ../../contracts/groundingTier.js, ../../epistemic/highSalienceBypass.js, openEvidenceVerification.js, signalGamingPolicy.js.
 *
 * @see docs/main_docu_files/RESILIENCE-ENGINE-REFERENCE.md §3 (Epistemic tiers and abstention)
 */

import { GROUNDING_TIER } from '../../contracts/groundingTier.js';
import { CRITICAL_BYPASS_SIGNAL_TYPES } from '../../epistemic/highSalienceBypass.js';

// --- Entailment thresholds ---

/** Minimum entailment/containment score per evidence type (LLM and embedding verifiers). */
export const ENTAILMENT_THRESHOLDS = {
  direct_quote_named_person: 0.7,
  named_survey_statistic: 0.5,
  named_institutional_fact: 0.5,
  observational_reported_fact: 0.4,
};

const DEFAULT_ENTAILMENT_THRESHOLD = 0.4;

/**
 * Entailment threshold for a given evidence_type label.
 *
 * @param {string|undefined|null} evidenceType
 * @returns {number}
 */
export function entailmentThresholdFor(evidenceType) {
  return ENTAILMENT_THRESHOLDS[evidenceType] ?? DEFAULT_ENTAILMENT_THRESHOLD;
}

/**
 * Whether tiered grounding verification is enabled (env RESILIENCE_GROUNDING_TIERED_VERIFY).
 *
 * @returns {boolean}
 */
export function isGroundingTieredVerifyEnabled() {
  return process.env.RESILIENCE_GROUNDING_TIERED_VERIFY !== '0';
}

/**
 * Whether the signal type is treated as critical for grounding tier decisions.
 *
 * @param {object} signal
 * @returns {boolean}
 */
export function isCriticalForGrounding(signal) {
  const type = signal?.signal_type ?? signal?.type;
  return CRITICAL_BYPASS_SIGNAL_TYPES.has(type);
}

// --- Tier assignment ---

/**
 * Mutate signal in place with grounding_tier and optional reason/method fields.
 *
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
 * @param {{ rescuedBy?: string|null, entailmentPending?: boolean }} [opts]
 * @returns {string} GROUNDING_TIER value
 */
export function deriveTierFromVerifyFailure(signal, verifyResult, opts = {}) {
  if (opts.entailmentPending) return GROUNDING_TIER.weak;
  if (isCriticalForGrounding(signal)) return GROUNDING_TIER.unverified_critical;
  return GROUNDING_TIER.rejected;
}

/**
 * Map a successful verification result to tier A (grounded).
 *
 * @param {{ reason?: string }} verifyResult
 * @param {{ rescuedBy?: string|null }} [opts]
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
 * After entailment fails: weak for non-critical, unverified_critical for critical types.
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

/** Grounding reason string when a critical signal remains unverified (operator alert path). */
export const UNVERIFIED_CRITICAL_GROUNDING_REASON = 'unverified_critical_grounding';

export {GROUNDING_TIER} from '../../contracts/groundingTier.js';
