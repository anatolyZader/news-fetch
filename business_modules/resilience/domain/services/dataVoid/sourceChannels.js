/**
 * Source channel classification for data-void / epistemic sampling analysis.
 */

export const DIGITAL_SOURCE_TYPES = new Set([
  'whatsapp',
  'telegram',
  'social',
  'x',
  'news',
  'radio',
]);

export const FIELD_SOURCE_TYPES = new Set([
  'field',
  'field_whatsapp',
  'pbo',
  'pbo_regional',
  'naftali',
]);

/** High-trust external probes — not counted as digital volume. */
export const PROBE_SOURCE_TYPES = new Set(['infrastructure_probe']);

/** Excluded from source-type cap denominator. */
export const CAP_EXEMPT_SOURCE_TYPES = new Set(['infrastructure_probe']);

const ALL_DIGITAL_CHANNELS = [...DIGITAL_SOURCE_TYPES];

/**
 * @param {object} signal
 * @returns {boolean}
 */
export function isDigitalSignal(signal) {
  return DIGITAL_SOURCE_TYPES.has(signal?.source_type);
}

/**
 * @param {object} signal
 * @returns {boolean}
 */
export function isFieldSignal(signal) {
  return FIELD_SOURCE_TYPES.has(signal?.source_type);
}

/**
 * @param {object} signal
 * @returns {boolean}
 */
export function isProbeSignal(signal) {
  return PROBE_SOURCE_TYPES.has(signal?.source_type);
}

/**
 * Distinct article/outlet count for a signal list filtered by source types.
 * @param {Array<object>} signals
 * @param {Set<string>} types
 * @returns {number}
 */
export function distinctSourceVolume(signals, types) {
  const keys = new Set();
  for (const s of signals ?? []) {
    if (!types.has(s?.source_type)) continue;
    const key = s.article_source ?? s.article_url ?? s.article_index ?? `_sig_${keys.size}`;
    keys.add(String(key));
  }
  return keys.size;
}

/**
 * Per-channel distinct article_source counts for today.
 * @param {Array<object>} signals
 * @returns {Record<string, number>}
 */
export function channelVolumesToday(signals) {
  /** @type {Record<string, Set<string>>} */
  const byChannel = {};
  for (const ch of ALL_DIGITAL_CHANNELS) byChannel[ch] = new Set();

  for (const s of signals ?? []) {
    const st = s?.source_type;
    if (!DIGITAL_SOURCE_TYPES.has(st)) continue;
    const key = s.article_source ?? s.article_url ?? s.article_index ?? `_anon_${byChannel[st].size}`;
    byChannel[st].add(String(key));
  }

  /** @type {Record<string, number>} */
  const out = {};
  for (const ch of ALL_DIGITAL_CHANNELS) {
    out[ch] = byChannel[ch].size;
  }
  return out;
}

/**
 * Total digital volume (distinct keys across all digital channels).
 * @param {Array<object>} signals
 * @returns {number}
 */
export function totalDigitalVolume(signals) {
  const keys = new Set();
  for (const s of signals ?? []) {
    if (!DIGITAL_SOURCE_TYPES.has(s?.source_type)) continue;
    const key = s.article_source ?? s.article_url ?? s.article_index ?? `_sig_${keys.size}`;
    keys.add(String(key));
  }
  return keys.size;
}

/**
 * @param {Array<object>} signals
 * @returns {number}
 */
export function totalFieldVolume(signals) {
  return distinctSourceVolume(signals, FIELD_SOURCE_TYPES);
}

/**
 * @param {object} signal
 * @returns {boolean}
 */
export function isAnchorSignal(signal) {
  return isFieldSignal(signal) || isProbeSignal(signal);
}

/**
 * Filter signals to trusted anchor family (field + infrastructure probes).
 * @param {Array<object>} signals
 * @returns {Array<object>}
 */
export function filterAnchorSignals(signals) {
  return (signals ?? []).filter((s) => isAnchorSignal(s));
}

/**
 * @param {Array<object>} signals
 * @returns {number}
 */
export function totalAnchorVolume(signals) {
  const keys = new Set();
  for (const s of signals ?? []) {
    if (!isAnchorSignal(s)) continue;
    const key = s.article_source ?? s.article_url ?? s.article_index ?? `_sig_${keys.size}`;
    keys.add(String(key));
  }
  return keys.size;
}

/**
 * Filter signals to field-anchor family only.
 * @param {Array<object>} signals
 * @returns {Array<object>}
 */
export function filterFieldAnchorSignals(signals) {
  return (signals ?? []).filter((s) => isFieldSignal(s));
}
