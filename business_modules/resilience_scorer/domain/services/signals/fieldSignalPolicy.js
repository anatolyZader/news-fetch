/**
 * Optional structured metadata for field-anchor signals.
 */

const FIELD_SOURCE_TYPES = new Set([
  'field',
  'visits', // canonical assess-time alias of 'field' (see visitsSourceType.js)
  'field_whatsapp',
  'pbo',
  'pbo_regional',
  'naftali',
]);

function isFieldFamilySource(signal) {
  return FIELD_SOURCE_TYPES.has(signal?.source_type);
}

/**
 * Attach field_provenance from known signal fields when missing.
 * @param {object} signal
 * @param {object} [hints]
 * @returns {object}
 */
export function enrichFieldProvenance(signal, hints = {}) {
  if (!isFieldFamilySource(signal)) return signal;
  const existing = signal.field_provenance ?? {};
  const fp = {
    officer_id: existing.officer_id ?? hints.officer_id ?? signal.sender_phone ?? null,
    visit_locality: existing.visit_locality ?? hints.visit_locality ?? signal.geo?.rawName ?? null,
    visit_timestamp: existing.visit_timestamp ?? hints.visit_timestamp ?? signal.article_date ?? null,
    connectivity_status_at_source: existing.connectivity_status_at_source
      ?? hints.connectivity_status_at_source
      ?? null,
  };
  return { ...signal, field_provenance: fp };
}
