/**
 * Detect chat meta-loops (tool catalog repeats) and user intent restatements.
 */

const RESTATEMENT_PATTERNS = [
  /\btold you\b/i,
  /\bprevious prompt\b/i,
  /\bi already (said|told|asked)\b/i,
  /\bi said (what|in)\b/i,
  /כבר אמרתי/,
  /אמרתי לך/,
  /בהודעה הקודמת/,
];

const CATALOG_MARKERS = [
  'compare_dates',
  'lookup_signals',
  'trace_component_timeline',
];

const CATALOG_OFFER_PATTERNS = [
  /what would you like/i,
  /here are the main tools/i,
  /available for past/i,
  /מה תרצה לדעת/,
];

/**
 * @param {Array<{ role?: string, content?: string }>} history
 * @returns {boolean}
 */
export function detectToolCatalogLoop(history) {
  const lastAssistant = [...(history ?? [])]
    .reverse()
    .find((m) => m?.role === 'assistant');
  const text = String(lastAssistant?.content ?? '');
  if (!text.trim()) return false;
  const markerHits = CATALOG_MARKERS.filter((m) => text.includes(m)).length;
  if (markerHits < 2) return false;
  return CATALOG_OFFER_PATTERNS.some((re) => re.test(text));
}

/**
 * @param {string} message
 * @returns {boolean}
 */
export function detectUserRestatement(message) {
  const text = String(message ?? '');
  return RESTATEMENT_PATTERNS.some((re) => re.test(text));
}

/**
 * @param {{
 *   history?: Array<{ role?: string, content?: string }>,
 *   message?: string,
 *   sliceResult?: { contextSlice?: string, componentId?: string },
 * }} params
 * @returns {boolean}
 */
export function shouldPrefetchTimeline(params) {
  const { history, message } = params;
  if (detectUserRestatement(message ?? '')) return true;
  if (detectToolCatalogLoop(history ?? [])) return true;
  return false;
}

/**
 * @param {{ reason?: string }} [opts]
 * @returns {string}
 */
export function buildAntiLoopNudge(opts = {}) {
  const reason = opts.reason ?? 'restatement';
  return (
    `ANTI-LOOP (${reason}): User restated intent — synthesize from PRE-FETCHED TIMELINE below if present; ` +
    `do not re-list tools. Call trace_component_timeline if timeline data is missing.\n`
  );
}

/**
 * @returns {string}
 */
export function buildRestatementNudgeOnly() {
  return (
    'ANTI-LOOP: User restated their question — execute trace_component_timeline or relevant tools now; ' +
    'do not re-list capabilities.\n'
  );
}
