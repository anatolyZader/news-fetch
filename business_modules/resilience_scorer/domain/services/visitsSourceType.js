/**
 * Visits module signals (legacy `field` source_type on disk).
 */

/**
 * @param {string} [sourceType]
 * @returns {boolean}
 */
export function isVisitsSourceType(sourceType) {
  const t = String(sourceType ?? '');
  return t === 'visits' || t === 'field' || t === 'field_whatsapp';
}

/**
 * Canonical pipeline/assess source key (legacy bundles may still say `field`).
 * @param {string} [sourceType]
 * @returns {string}
 */
export function normalizeVisitsSourceType(sourceType) {
  const t = String(sourceType ?? '');
  if (t === 'field') return 'visits';
  return t;
}

/**
 * @param {string} [configKey]
 * @returns {string}
 */
export function normalizePipelineSourceKey(configKey) {
  const k = String(configKey ?? '');
  if (k === 'field') return 'visits';
  return k;
}
