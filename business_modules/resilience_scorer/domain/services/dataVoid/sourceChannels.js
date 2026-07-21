/**
 * Source channel classification for data-void and epistemic sampling analysis.
 *
 * Pipeline position: shared utility across void index, scoring partition, and
 * epistemic gate — classifies signals by digital/field/probe family.
 *
 * Owns: source-type sets, volume counters, anchor/field filters.
 * Does NOT: decide assessment_mode or quarantine policy.
 *
 * Key collaborators: `dataVoid/computeDataVoidIndex.js`, `dataVoid/scoringPartition.js`,
 * `dataVoid/epistemicGate.js`, `operator/componentDiagnostics.js`.
 */

// ── Source type sets ──────────────────────────────────────────────────────────

/** All digital channels counted toward void baselines. */
export const DIGITAL_SOURCE_TYPES = new Set([
  'whatsapp',
  'telegram',
  'social',
  'x',
  'news',
  'radio',
]);

/** OSINT / citizen digital — hard-quarantined during partial void partitions. */
export const HARD_DIGITAL_SOURCE_TYPES = new Set([
  'whatsapp',
  'telegram',
  'social',
  'x',
]);

/** Press/radio — soft-included at reduced weight when anchors active (not digital_darkness). */
export const SOFT_DIGITAL_SOURCE_TYPES = new Set([
  'news',
  'radio',
]);

export const FIELD_SOURCE_TYPES = new Set([
  'visits',
  'field', // read-compat for older bundles
  'field_whatsapp',
  'pbo',
  'pbo_regional',
  'naftali',
]);

/** High-trust external probes — not counted as digital volume. */
export const PROBE_SOURCE_TYPES = new Set(['infrastructure_probe']);

const ALL_DIGITAL_CHANNELS = [...DIGITAL_SOURCE_TYPES];

// ── Type predicates ───────────────────────────────────────────────────────────

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
export function isHardDigitalSignal(signal) {
  return HARD_DIGITAL_SOURCE_TYPES.has(signal?.source_type);
}

/**
 * @param {object} signal
 * @returns {boolean}
 */
export function isSoftDigitalSignal(signal) {
  return SOFT_DIGITAL_SOURCE_TYPES.has(signal?.source_type);
}

/**
 * @param {Array<object>} signals
 * @returns {Array<object>}
 */
export function filterSoftDigitalSignals(signals) {
  return (signals ?? []).filter((s) => isSoftDigitalSignal(s));
}

/**
 * @param {Array<object>} signals
 * @returns {Array<object>}
 */
export function filterHardDigitalSignals(signals) {
  return (signals ?? []).filter((s) => isHardDigitalSignal(s));
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

// ── Volume metrics ────────────────────────────────────────────────────────────

/**
 * Distinct article/outlet count for signals filtered by source types.
 *
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

// ── Anchor filters ────────────────────────────────────────────────────────────

/**
 * Whether signal is field-anchor or infrastructure-probe family.
 *
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
