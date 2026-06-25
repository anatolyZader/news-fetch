/**
 * Pre-score epistemic partition — isolate digital before scoreComponents runs.
 *
 * Handles digital_darkness, connectivity isolation (field or probe anchors),
 * prior same-day quarantine state, and elevated/critical abstention.
 */

import { isSoftVoidWarning } from '../../../../../cross-cut-modules/resilience-contracts/softVoidReasons.js';
import {
  filterAnchorSignals,
  filterHardDigitalSignals,
  filterSoftDigitalSignals,
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
    const volumeRecovered = digitalQuarantined.length > 0 && dataVoid.digital_darkness !== true;
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
