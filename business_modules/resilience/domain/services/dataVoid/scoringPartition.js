/**
 * Pre-score epistemic partition — isolate digital before scoreComponents runs.
 *
 * Handles digital_darkness, connectivity isolation (field or probe anchors),
 * prior same-day quarantine state, and elevated/critical abstention.
 */

import {
  filterAnchorSignals,
  isDigitalSignal,
  totalAnchorVolume,
} from './sourceChannels.js';

const ELEVATED_OR_ABOVE = new Set(['elevated', 'critical']);

export const QUARANTINE_REASON = Object.freeze({
  DIGITAL_DARKNESS: 'digital_darkness',
  CONNECTIVITY_ISOLATION: 'connectivity_isolation',
  PRIOR_QUARANTINE: 'prior_quarantine',
});

/**
 * @param {NodeJS.ProcessEnv} [env]
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
  };

  if (!isScoringPartitionEnabled() || !dataVoid) {
    return normal;
  }

  const voidLevel = dataVoid.level ?? 'none';
  const anchorOnly = filterAnchorSignals(list);
  const digitalQuarantined = list.filter((s) => isDigitalSignal(s));
  const prior = opts.priorQuarantine ?? null;

  if (prior?.active === true) {
    const reason = prior.reason ?? QUARANTINE_REASON.PRIOR_QUARANTINE;
    if (anchorOnly.length > 0) {
      return partitionResult(anchorOnly, digitalQuarantined, reason);
    }
    return {
      assessmentMode: 'abstained',
      scoringSignals: list,
      quarantinedSignals: digitalQuarantined,
      quarantineReason: reason,
      partitionApplied: true,
    };
  }

  if (dataVoid.digital_darkness === true) {
    return partitionResult(anchorOnly, digitalQuarantined, QUARANTINE_REASON.DIGITAL_DARKNESS);
  }

  if (hasConnectivityOutage(dataVoid)) {
    if (anchorActive(dataVoid, list)) {
      return partitionResult(anchorOnly, digitalQuarantined, QUARANTINE_REASON.CONNECTIVITY_ISOLATION);
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

/**
 * @param {Array<object>} quarantined
 * @param {string|null} [reason]
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
