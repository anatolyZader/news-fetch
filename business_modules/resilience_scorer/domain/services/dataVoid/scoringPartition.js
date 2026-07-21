/**
 * Pre-score epistemic partition — isolate digital signals before scoreComponents runs.
 *
 * Pipeline position: evidencePipelinePrep — after void index, before component scoring;
 * output feeds epistemic gate and digital quarantine persistence.
 *
 * Owns: scoringSignals vs quarantinedSignals split, assessmentMode selection,
 * prior same-day quarantine recovery rules.
 * Does NOT: compute void index or attach fields to assessment.
 *
 * Key collaborators: `dataVoid/sourceChannels.js`, `dataVoid/epistemicGate.js`,
 * `dataVoid/digitalQuarantineState.js`, `contracts/softVoidReasons.js`.
 */

import { isSoftVoidWarning } from '../../contracts/softVoidReasons.js';
import {
  filterAnchorSignals,
  filterHardDigitalSignals,
  filterSoftDigitalSignals,
  isDigitalSignal,
  totalAnchorVolume,
} from './sourceChannels.js';

const ELEVATED_OR_ABOVE = new Set(['elevated', 'critical']);

// ── Constants and feature flags ───────────────────────────────────────────────

/** Reasons recorded when digital signals are quarantined from scoring. */
export const QUARANTINE_REASON = Object.freeze({
  DIGITAL_DARKNESS: 'digital_darkness',
  CONNECTIVITY_ISOLATION: 'connectivity_isolation',
  PRIOR_QUARANTINE: 'prior_quarantine',
});

/**
 * Whether pre-score scoring partition is enabled (RESILIENCE_SCORING_PARTITION !== '0').
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isScoringPartitionEnabled(env = process.env) {
  return env.RESILIENCE_SCORING_PARTITION !== '0';
}

/**
 * @param {object|null|undefined} dataVoid
 */
function hasConnectivityOutage(dataVoid) {
  if (!dataVoid) return false;
  return (dataVoid.connectivity_outage_signals ?? 0) > 0 || dataVoid.probe_outage === true;
}

// ── Quarantine recovery threshold ───────────────────────────────────────────
// Strict mode (RESILIENCE_QUARANTINE_STRICT_RECOVERY=1, currently OFF by
// default): a prior same-day quarantine holds until digital volume GENUINELY
// recovers — at least RESILIENCE_QUARANTINE_RECOVERY_MIN digital signals
// (default 5) and at least RESILIENCE_QUARANTINE_RECOVERY_FRACTION of the
// expected baseline volume (default 0.5), with the void index itself subsided
// below elevated. Lenient default: any digital signal with no darkness lifts
// the quarantine (historical behavior; strict mode parked pending operational
// experience).

const RECOVERY_MIN_DEFAULT = 5;
const RECOVERY_FRACTION_DEFAULT = 0.5;

/**
 * Whether strict quarantine recovery thresholds are enabled.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isStrictQuarantineRecoveryEnabled(env = process.env) {
  return env.RESILIENCE_QUARANTINE_STRICT_RECOVERY === '1';
}

/**
 * @param {object} dataVoid
 * @param {NodeJS.ProcessEnv} [env]
 */
function quarantineRecoveryThreshold(dataVoid, env = process.env) {
  const rawMin = Number.parseInt(env.RESILIENCE_QUARANTINE_RECOVERY_MIN ?? '', 10);
  const min = Number.isFinite(rawMin) && rawMin >= 1 ? rawMin : RECOVERY_MIN_DEFAULT;
  const rawFrac = Number.parseFloat(env.RESILIENCE_QUARANTINE_RECOVERY_FRACTION ?? '');
  const frac = Number.isFinite(rawFrac) && rawFrac > 0 && rawFrac <= 1
    ? rawFrac
    : RECOVERY_FRACTION_DEFAULT;
  const expected = dataVoid?.expected_digital_volume ?? 0;
  return Math.max(min, Math.ceil(expected * frac));
}

/**
 * @param {object} dataVoid
 * @param {Array<object>} digitalQuarantined digital signals in the current batch
 */
function digitalVolumeRecovered(dataVoid, digitalQuarantined) {
  if (dataVoid.digital_darkness === true) return false;
  if (!isStrictQuarantineRecoveryEnabled()) {
    return digitalQuarantined.length > 0;
  }
  if (ELEVATED_OR_ABOVE.has(dataVoid.level ?? 'none')) return false;
  const volume = dataVoid.actual_digital_volume ?? digitalQuarantined.length;
  return volume >= quarantineRecoveryThreshold(dataVoid);
}

/**
 * @param {object|null|undefined} dataVoid
 * @param {Array<object>} signals
 */
function anchorActive(dataVoid, signals) {
  const fromVoid = (dataVoid?.field_volume ?? 0) + (dataVoid?.anchor_volume ?? 0);
  if (fromVoid > 0) return true;
  return totalAnchorVolume(signals) > 0;
}

/**
 * @param {Array<object>} scoringSignals
 * @param {Array<object>} quarantinedSignals
 * @param {string} reason
 */
function partitionResult(scoringSignals, quarantinedSignals, reason) {
  return {
    assessmentMode: 'field_anchor_only',
    scoringSignals,
    quarantinedSignals,
    quarantineReason: reason,
    partitionApplied: true,
  };
}

/**
 * Anchor + soft press/radio at partial weight; hard digital quarantined.
 * @param {Array<object>} list
 * @returns {{ scoringSignals: Array<object>, quarantinedSignals: Array<object> }}
 */
function partitionAnchorPlusSoftPress(list) {
  const anchors = filterAnchorSignals(list);
  const softPress = filterSoftDigitalSignals(list).map((s) => ({
    ...s,
    partial_void_press: true,
  }));
  return {
    scoringSignals: [...anchors, ...softPress],
    quarantinedSignals: filterHardDigitalSignals(list),
  };
}

// ── Partition resolution ────────────────────────────────────────────────────────

/**
 * Resolve scoring partition: which signals score vs quarantine under void/quarantine state.
 *
 * @param {Array<object>} signals
 * @param {object|null|undefined} dataVoid
 * @param {object} [opts]
 * @param {object|null|undefined} [opts.priorQuarantine]
 * @returns {{
 *   assessmentMode: 'normal' | 'field_anchor_only' | 'abstained',
 *   scoringSignals: Array<object>,
 *   quarantinedSignals: Array<object>,
 *   quarantineReason: string | null,
 *   partitionApplied: boolean,
 *   priorQuarantineSkipped: string | null,
 * }}
 */
export function resolveScoringPartition(signals, dataVoid, opts = {}) {
  const list = Array.isArray(signals) ? signals : [];
  const normal = {
    assessmentMode: 'normal',
    scoringSignals: list,
    quarantinedSignals: [],
    quarantineReason: null,
    partitionApplied: false,
    priorQuarantineSkipped: null,
  };

  if (!isScoringPartitionEnabled() || !dataVoid) {
    return normal;
  }

  if (isSoftVoidWarning(dataVoid)) {
    return normal;
  }

  const voidLevel = dataVoid.level ?? 'none';
  const anchorOnly = filterAnchorSignals(list);
  const digitalQuarantined = list.filter((s) => isDigitalSignal(s));
  const prior = opts.priorQuarantine ?? null;

  if (prior?.active === true) {
    const volumeRecovered = digitalVolumeRecovered(dataVoid, digitalQuarantined);
    if (volumeRecovered) {
      return {
        ...normal,
        priorQuarantineSkipped: 'volume_recovered',
      };
    }
    const reason = prior.reason ?? QUARANTINE_REASON.PRIOR_QUARANTINE;
    if (anchorOnly.length > 0) {
      const { scoringSignals, quarantinedSignals } = partitionAnchorPlusSoftPress(list);
      return partitionResult(scoringSignals, quarantinedSignals, reason);
    }
    return {
      assessmentMode: 'abstained',
      scoringSignals: list,
      quarantinedSignals: digitalQuarantined,
      quarantineReason: reason,
      partitionApplied: true,
      priorQuarantineSkipped: null,
    };
  }

  if (dataVoid.digital_darkness === true) {
    return partitionResult(anchorOnly, digitalQuarantined, QUARANTINE_REASON.DIGITAL_DARKNESS);
  }

  if (hasConnectivityOutage(dataVoid)) {
    if (anchorActive(dataVoid, list)) {
      const { scoringSignals, quarantinedSignals } = partitionAnchorPlusSoftPress(list);
      return partitionResult(scoringSignals, quarantinedSignals, QUARANTINE_REASON.CONNECTIVITY_ISOLATION);
    }
    return {
      assessmentMode: 'abstained',
      scoringSignals: list,
      quarantinedSignals: digitalQuarantined,
      quarantineReason: QUARANTINE_REASON.CONNECTIVITY_ISOLATION,
      partitionApplied: true,
    };
  }

  if (ELEVATED_OR_ABOVE.has(voidLevel)) {
    return {
      assessmentMode: 'abstained',
      scoringSignals: list,
      quarantinedSignals: [],
      quarantineReason: null,
      partitionApplied: true,
    };
  }

  return normal;
}

// ── Quarantine summary ──────────────────────────────────────────────────────────

/**
 * Summarize quarantined signals for assessment.quarantined_digital attachment.
 *
 * @param {Array<object>} quarantined
 * @param {string|null} [reason]
 * @returns {object|null}
 */
export function summarizeQuarantinedSignals(quarantined, reason = null) {
  const list = Array.isArray(quarantined) ? quarantined : [];
  if (list.length === 0) return null;

  /** @type {Record<string, number>} */
  const bySourceType = {};
  for (const s of list) {
    const st = s?.source_type ?? 'unknown';
    bySourceType[st] = (bySourceType[st] ?? 0) + 1;
  }

  const sampleEvidence = list
    .map((s) => String(s?.evidence ?? '').trim())
    .filter(Boolean)
    .slice(0, 3);

  return {
    count: list.length,
    reason: reason ?? null,
    by_source_type: bySourceType,
    sample_evidence: sampleEvidence,
  };
}
