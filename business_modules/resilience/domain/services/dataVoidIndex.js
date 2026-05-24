/**
 * Data void / digital darkness index — detect information vacuum vs stability.
 */

const DIGITAL_SOURCE_TYPES = new Set(['whatsapp', 'telegram', 'social', 'x', 'news', 'radio']);
const FIELD_SOURCE_TYPES = new Set(['field', 'pbo', 'pbo_regional', 'naftali']);

/**
 * @param {Array<object>} signals — today's signals (scoped)
 * @param {Array<object>} [historicalSignals] — prior days for baseline volume (optional)
 * @param {{ reportScope?: string }} [opts]
 */
export function computeDataVoidIndex(signals, historicalSignals = [], opts = {}) {
  if (process.env.RESILIENCE_DATA_VOID === '0') {
    return { level: 'none', digital_darkness: false, clusters: [] };
  }

  const list = Array.isArray(signals) ? signals : [];
  const hist = Array.isArray(historicalSignals) ? historicalSignals : [];

  const countByType = (arr, types) => arr.filter((s) => types.has(s?.source_type)).length;

  const digitalToday = countByType(list, DIGITAL_SOURCE_TYPES);
  const fieldToday = countByType(list, FIELD_SOURCE_TYPES);
  const connectivityTags = list.filter((s) => s?.signal_type === 'connectivity_outage').length;

  const digitalHist = [];
  for (const daySigs of hist) {
    digitalHist.push(countByType(daySigs, DIGITAL_SOURCE_TYPES));
  }
  const expectedDigital = digitalHist.length > 0
    ? median(digitalHist)
    : Math.max(3, digitalToday);

  const digitalDrop = expectedDigital > 0 && digitalToday === 0;
  const fieldActive = fieldToday > 0;
  const digital_darkness = digitalDrop && fieldActive;

  let level = 'none';
  if (digital_darkness || connectivityTags > 0) level = 'critical';
  else if (digitalToday === 0 && fieldToday === 0 && list.length < 2) level = 'elevated';
  else if (digitalToday < expectedDigital * 0.25 && expectedDigital >= 5) level = 'warning';

  return {
    level,
    digital_darkness,
    information_vacuum_index: vacuumIndexForLevel(level, digitalToday, expectedDigital),
    connectivity_outage_signals: connectivityTags,
    expected_digital_volume: expectedDigital,
    actual_digital_volume: digitalToday,
    field_volume: fieldToday,
    affected_clusters: digital_darkness ? [{ reason: 'digital_darkness', field_active: true }] : [],
    report_scope: opts.reportScope ?? 'national',
  };
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Composite 0–1 index: higher = more severe information vacuum. */
function vacuumIndexForLevel(level, digitalToday, expectedDigital) {
  if (level === 'critical') return 0.9;
  if (level === 'elevated') return 0.65;
  if (level === 'warning') return 0.35;
  if (expectedDigital > 0 && digitalToday < expectedDigital * 0.5) return 0.2;
  return 0;
}

export function isDataVoidEnabled() {
  return process.env.RESILIENCE_DATA_VOID !== '0';
}
