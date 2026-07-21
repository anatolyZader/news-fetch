/**
 * Multi-channel EWMA baselines and z-score drop detection for data void.
 *
 * Pipeline position: called by computeDataVoidIndex — builds expected volumes
 * and per-channel baselines from historical signal days.
 *
 * Owns: EWMA/stddev/z-score helpers, volume baseline computation, silence thresholds.
 * Does NOT: assign void level or quarantine signals.
 *
 * Key collaborators: `dataVoid/sourceChannels.js`, `dataVoid/computeDataVoidIndex.js`,
 * `dataVoid/clusterVoid.js`.
 */

import {
  DIGITAL_SOURCE_TYPES,
  
  channelVolumesToday,
  totalDigitalVolume,
  totalFieldVolume,
} from './sourceChannels.js';

const EWMA_ALPHA = 0.3;
const Z_DROP_THRESHOLD = -2;

function parseEnvInt(name, fallback) {
  const raw = Number.parseInt(process.env[name] ?? String(fallback), 10);
  return Number.isFinite(raw) ? raw : fallback;
}

// ── Env thresholds ────────────────────────────────────────────────────────────

/**
 * Minimum expected digital baseline for total-silence detection.
 *
 * @returns {number}
 */
export function totalSilenceMinBaseline() {
  return parseEnvInt('RESILIENCE_VOID_TOTAL_SILENCE_MIN_BASELINE', 3);
}

/** Avoid EWMA float drift (e.g. 2.999… vs min 3) on threshold checks. */
export function meetsSilenceBaseline(value, min = totalSilenceMinBaseline()) {
  return Number(value) >= min - 1e-6;
}

// ── Statistical helpers ───────────────────────────────────────────────────────

/**
 * Exponential weighted moving average over a numeric series (oldest first).
 *
 * @param {number[]} series
 * @returns {number}
 */
export function ewma(series) {
  const s = (series ?? []).filter((v) => Number.isFinite(v));
  if (s.length === 0) return 0;
  let val = s[0];
  for (let i = 1; i < s.length; i++) {
    val = EWMA_ALPHA * s[i] + (1 - EWMA_ALPHA) * val;
  }
  return val;
}

/**
 * @param {number[]} series
 * @returns {number}
 */
export function stddev(series) {
  const s = (series ?? []).filter((v) => Number.isFinite(v));
  if (s.length < 2) return 0;
  const m = s.reduce((a, b) => a + b, 0) / s.length;
  const v = s.reduce((acc, x) => acc + (x - m) ** 2, 0) / (s.length - 1);
  return Math.sqrt(v);
}

/**
 * @param {number} today
 * @param {number} baseline
 * @param {number} sd
 * @returns {number|null}
 */
export function zScore(today, baseline, sd) {
  if (!Number.isFinite(today) || !Number.isFinite(baseline)) return null;
  if (sd === 0) {
    if (today === baseline) return 0;
    return today < baseline ? -3 : 3;
  }
  return (today - baseline) / sd;
}

/**
 * Build daily total-digital and total-field volume series from historical signal days.
 * @param {Array<Array<object>>} historicalDays oldest-first
 * @returns {{ digitalSeries: number[], fieldSeries: number[], channelSeries: Record<string, number[]> }}
 */
export function buildHistoricalVolumeSeries(historicalDays) {
  const digitalSeries = [];
  const fieldSeries = [];
  /** @type {Record<string, number[]>} */
  const channelSeries = {};
  for (const ch of DIGITAL_SOURCE_TYPES) channelSeries[ch] = [];

  for (const daySigs of historicalDays ?? []) {
    digitalSeries.push(totalDigitalVolume(daySigs));
    fieldSeries.push(totalFieldVolume(daySigs));
    const chVol = channelVolumesToday(daySigs);
    for (const ch of DIGITAL_SOURCE_TYPES) {
      channelSeries[ch].push(chVol[ch] ?? 0);
    }
  }
  return { digitalSeries, fieldSeries, channelSeries };
}

// ── Volume baselines ──────────────────────────────────────────────────────────

/**
 * Compute today vs expected digital/field volumes and per-channel baselines.
 *
 * @param {Array<object>} signals Today's signals.
 * @param {Array<Array<object>>} historicalDays Prior days oldest-first.
 * @returns {{
 *   digitalToday: number,
 *   fieldToday: number,
 *   expectedDigital: number,
 *   expectedField: number,
 *   digitalEwma7: number,
 *   digitalEwma14: number,
 *   digitalEwma30: number,
 *   digitalZ: number|null,
 *   digitalDrop: boolean,
 *   channelBaselines: Record<string, { today: number, ewma: number, z: number|null }>,
 * }}
 */
export function computeVolumeBaselines(signals, historicalDays) {
  const list = Array.isArray(signals) ? signals : [];
  const { digitalSeries, fieldSeries, channelSeries } = buildHistoricalVolumeSeries(historicalDays);

  const digitalToday = totalDigitalVolume(list);
  const fieldToday = totalFieldVolume(list);

  const digitalEwma7 = ewma(digitalSeries.slice(-7));
  const digitalEwma14 = ewma(digitalSeries.slice(-14));
  const digitalEwma30 = ewma(digitalSeries.slice(-30));

  const expectedDigital = digitalSeries.length > 0
    ? digitalEwma7
    : Math.max(totalSilenceMinBaseline(), digitalToday);

  const expectedField = fieldSeries.length > 0
    ? ewma(fieldSeries.slice(-7))
    : Math.max(1, fieldToday);

  const digitalSd = stddev(digitalSeries.slice(-14));
  const digitalZ = zScore(digitalToday, expectedDigital, digitalSd);

  const minBaseline = totalSilenceMinBaseline();
  const digitalDrop = (digitalZ != null && digitalZ <= Z_DROP_THRESHOLD)
    || (expectedDigital >= minBaseline && digitalToday === 0);

  /** @type {Record<string, { today: number, ewma: number, z: number|null }>} */
  const channelBaselines = {};
  const chToday = channelVolumesToday(list);
  for (const ch of DIGITAL_SOURCE_TYPES) {
    const series = channelSeries[ch] ?? [];
    const chEwma = series.length > 0 ? ewma(series.slice(-7)) : chToday[ch] ?? 0;
    const chSd = stddev(series.slice(-14));
    channelBaselines[ch] = {
      today: chToday[ch] ?? 0,
      ewma: chEwma,
      z: zScore(chToday[ch] ?? 0, chEwma, chSd),
    };
  }

  return {
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
  };
}

/**
 * @param {number} today
 * @param {number} baseline
 * @returns {boolean}
 */
export function isBelowQuarterBaseline(today, baseline) {
  if (baseline <= 0) return false;
  return today < baseline * 0.25;
}

export { Z_DROP_THRESHOLD };