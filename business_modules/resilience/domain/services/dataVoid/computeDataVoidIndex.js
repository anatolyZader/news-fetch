/**
 * Data void / digital darkness index v2 — multi-channel baselines, cluster void, expanded rules.
 */

import {
  isFieldSignal,
  isProbeSignal,
  totalFieldVolume,
} from './sourceChannels.js';
import {
  computeVolumeBaselines,
  isBelowQuarterBaseline,
  totalSilenceMinBaseline,
} from './channelBaselines.js';
import { computeClusterVoids, channelLevelVoids } from './clusterVoid.js';

/** Composite 0–1 index: higher = more severe information vacuum. */
function vacuumIndexForLevel(level, digitalToday, expectedDigital) {
  if (level === 'critical') return 0.9;
  if (level === 'elevated') return 0.65;
  if (level === 'warning') return 0.35;
  if (expectedDigital > 0 && digitalToday < expectedDigital * 0.5) return 0.2;
  return 0;
}

/**
 * Determine void level and primary reason.
 * @param {object} ctx
 * @returns {{ level: string, reason: string|null, digital_darkness: boolean }}
 */
function resolveVoidLevel(ctx) {
  const {
    digital_darkness,
    connectivityTags,
    probeOutage,
    total_silence,
    partial_silence,
    digitalToday,
    fieldToday,
    listLength,
    digitalDrop,
    expectedDigital,
  } = ctx;

  if (digital_darkness) {
    return { level: 'critical', reason: 'digital_darkness', digital_darkness: true };
  }
  if (connectivityTags > 0 || probeOutage) {
    return {
      level: 'critical',
      reason: probeOutage ? 'probe_outage' : 'connectivity_outage',
      digital_darkness: false,
    };
  }
  if (total_silence) {
    return { level: 'critical', reason: 'total_silence', digital_darkness: false };
  }
  if (partial_silence) {
    return { level: 'critical', reason: 'partial_silence', digital_darkness: false };
  }
  if (digitalToday === 0 && fieldToday === 0 && listLength < 2) {
    return { level: 'elevated', reason: 'sparse_sampling', digital_darkness: false };
  }
  if (isBelowQuarterBaseline(digitalToday, expectedDigital) && expectedDigital >= 5) {
    return { level: 'warning', reason: 'digital_volume_drop', digital_darkness: false };
  }
  if (digitalDrop && !digital_darkness) {
    return { level: 'warning', reason: 'digital_z_drop', digital_darkness: false };
  }
  return { level: 'none', reason: null, digital_darkness: false };
}

/**
 * @param {Array<object>} signals — today's signals (scoped)
 * @param {Array<Array<object>>} [historicalSignals] — prior days for baseline volume (optional)
 * @param {{ reportScope?: string, voidStatus?: string }} [opts]
 */
export function computeDataVoidIndex(signals, historicalSignals = [], opts = {}) {
  if (process.env.RESILIENCE_DATA_VOID === '0') {
    return {
      level: 'none',
      digital_darkness: false,
      affected_clusters: [],
      void_status: opts.voidStatus ?? 'disabled',
    };
  }

  if (opts.voidStatus === 'unavailable') {
    return {
      level: 'none',
      digital_darkness: false,
      affected_clusters: [],
      void_status: 'unavailable',
      reason: null,
    };
  }

  const list = Array.isArray(signals) ? signals : [];
  const hist = Array.isArray(historicalSignals) ? historicalSignals : [];

  const baselines = computeVolumeBaselines(list, hist);
  const {
    digitalToday,
    fieldToday,
    expectedDigital,
    expectedField,
    digitalEwma7,
    digitalEwma14,
    digitalEwma30,
    digitalZ,
    digitalDrop,
    channelBaselines,
  } = baselines;

  const fieldActive = fieldToday > 0;
  const digital_darkness = digitalDrop && fieldActive;

  const connectivityTags = list.filter((s) => s?.signal_type === 'connectivity_outage').length;
  const probeOutage = list.some(
    (s) => isProbeSignal(s) && (s.signal_type === 'connectivity_outage' || s.connectivity_outage === true),
  );

  const minBaseline = totalSilenceMinBaseline();
  const total_silence = digitalToday === 0
    && fieldToday === 0
    && expectedDigital >= minBaseline;

  const partial_silence = isBelowQuarterBaseline(digitalToday, expectedDigital)
    && isBelowQuarterBaseline(fieldToday, expectedField)
    && expectedDigital >= minBaseline;

  const { level, reason } = resolveVoidLevel({
    digital_darkness,
    connectivityTags,
    probeOutage,
    total_silence,
    partial_silence,
    digitalToday,
    fieldToday,
    listLength: list.length,
    digitalDrop,
    expectedDigital,
  });

  const clusterVoids = computeClusterVoids(list, hist);
  const channelVoids = channelLevelVoids(channelBaselines);

  /** @type {Array<object>} */
  let affected_clusters = [...clusterVoids, ...channelVoids];
  if (digital_darkness && affected_clusters.length === 0) {
    affected_clusters = [{ reason: 'digital_darkness', field_active: true, cluster: '_global' }];
  }
  if (total_silence) {
    affected_clusters.push({ reason: 'total_silence', cluster: '_global', field_active: false });
  }

  return {
    level,
    reason,
    digital_darkness,
    total_silence,
    partial_silence,
    information_vacuum_index: vacuumIndexForLevel(level, digitalToday, expectedDigital),
    connectivity_outage_signals: connectivityTags,
    probe_outage: probeOutage,
    expected_digital_volume: Math.round(expectedDigital * 100) / 100,
    actual_digital_volume: digitalToday,
    expected_field_volume: Math.round(expectedField * 100) / 100,
    field_volume: fieldToday,
    digital_z: digitalZ != null ? Math.round(digitalZ * 100) / 100 : null,
    digital_ewma_7: Math.round(digitalEwma7 * 100) / 100,
    digital_ewma_14: Math.round(digitalEwma14 * 100) / 100,
    digital_ewma_30: Math.round(digitalEwma30 * 100) / 100,
    channel_baselines: channelBaselines,
    affected_clusters,
    report_scope: opts.reportScope ?? 'national',
    void_status: opts.voidStatus ?? 'active',
  };
}

export function isDataVoidEnabled() {
  return process.env.RESILIENCE_DATA_VOID !== '0';
}
