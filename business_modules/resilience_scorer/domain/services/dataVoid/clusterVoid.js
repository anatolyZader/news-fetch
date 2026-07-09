/**
 * Per-cluster (PBO subregion) digital void detection.
 */

import { groupSignalsBySubregion } from '../../../../geo/index.js';
import {
  DIGITAL_SOURCE_TYPES,
  FIELD_SOURCE_TYPES,
  distinctSourceVolume,
} from './sourceChannels.js';
import { ewma, stddev, zScore, Z_DROP_THRESHOLD } from './channelBaselines.js';

/**
 * @param {Array<object>} daySignals
 * @param {string} clusterKey
 * @returns {number}
 */
function clusterDigitalVolume(daySignals, clusterKey) {
  const grouped = groupSignalsBySubregion(daySignals);
  const subset = grouped[clusterKey] ?? [];
  return distinctSourceVolume(subset, DIGITAL_SOURCE_TYPES);
}

/**
 * @param {Array<object>} daySignals
 * @param {string} clusterKey
 * @returns {number}
 */
function clusterFieldVolume(daySignals, clusterKey) {
  const grouped = groupSignalsBySubregion(daySignals);
  const subset = grouped[clusterKey] ?? [];
  return distinctSourceVolume(subset, FIELD_SOURCE_TYPES);
}

/**
 * @param {Array<object>} signals today (scoped)
 * @param {Array<Array<object>>} historicalDays oldest-first
 * @returns {Array<object>} affected_clusters
 */
export function computeClusterVoids(signals, historicalDays) {
  const list = Array.isArray(signals) ? signals : [];
  const hist = Array.isArray(historicalDays) ? historicalDays : [];

  const todayGrouped = groupSignalsBySubregion(list);
  const clusterKeys = new Set([
    ...Object.keys(todayGrouped),
    ...hist.flatMap((day) => Object.keys(groupSignalsBySubregion(day))),
  ]);

  /** @type {Array<object>} */
  const affected = [];

  for (const cluster of clusterKeys) {
    if (cluster === '_no_geo' || cluster === '_unknown' || cluster === '_resolved_no_id') continue;

    const digitalToday = clusterDigitalVolume(list, cluster);
    const fieldToday = clusterFieldVolume(list, cluster);

    const digitalHist = hist.map((day) => clusterDigitalVolume(day, cluster));
    const expectedDigital = digitalHist.length > 0 ? ewma(digitalHist.slice(-7)) : digitalToday;
    const digitalSd = stddev(digitalHist.slice(-14));
    const digitalZ = zScore(digitalToday, expectedDigital, digitalSd);

    const fieldActive = fieldToday > 0;
    const digitalVoid = (digitalZ != null && digitalZ <= Z_DROP_THRESHOLD && fieldActive)
      || (expectedDigital >= 2 && digitalToday === 0 && fieldActive);

    if (digitalVoid) {
      affected.push({
        cluster,
        reason: 'cluster_digital_darkness',
        digital_z: digitalZ,
        digital_volume: digitalToday,
        expected_digital: expectedDigital,
        field_volume: fieldToday,
        field_active: true,
      });
    }
  }

  return affected;
}

/**
 * Channel-level void entries for affected_clusters payload.
 * @param {Record<string, { today: number, ewma: number, z: number|null }>} channelBaselines
 * @returns {Array<object>}
 */
export function channelLevelVoids(channelBaselines) {
  /** @type {Array<object>} */
  const out = [];
  for (const [sourceType, stats] of Object.entries(channelBaselines ?? {})) {
    if (stats.z != null && stats.z <= Z_DROP_THRESHOLD && stats.ewma >= 2) {
      out.push({
        cluster: '_global',
        source_type: sourceType,
        reason: 'channel_drop',
        digital_z: stats.z,
        digital_volume: stats.today,
        expected_digital: stats.ewma,
      });
    }
  }
  return out;
}