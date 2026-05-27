/**
 * Optional structured metadata for field-anchor signals.
 */

export const FIELD_PROVENANCE_FIELDS = [
  'officer_id',
  'visit_locality',
  'visit_timestamp',
  'connectivity_status_at_source',
];

const FIELD_SOURCE_TYPES = new Set([
  'field',
  'field_whatsapp',
  'pbo',
  'pbo_regional',
  'naftali',
]);

/**
 * @param {object} signal
 * @returns {boolean}
 */
export function isFieldFamilySource(signal) {
  return FIELD_SOURCE_TYPES.has(signal?.source_type);
}

/**
 * @param {object} signal
 * @returns {boolean}
 */
export function hasFieldGeoBinding(signal) {
  const fp = signal?.field_provenance;
  if (fp?.visit_locality) return true;
  const g = signal?.geo;
  return g?.kind === 'resolved';
}

/**
 * Apply RESILIENCE_FIELD_GEO_DISCOUNT when field signal lacks geo binding.
 * @param {object} signal
 * @param {number} contribution
 * @returns {number}
 */
export function applyFieldGeoDiscount(signal, contribution) {
  if (!isFieldFamilySource(signal)) return contribution;
  if (hasFieldGeoBinding(signal)) return contribution;
  const raw = Number.parseFloat(process.env.RESILIENCE_FIELD_GEO_DISCOUNT ?? '0.5');
  const discount = Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : 0.5;
  return contribution * discount;
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
