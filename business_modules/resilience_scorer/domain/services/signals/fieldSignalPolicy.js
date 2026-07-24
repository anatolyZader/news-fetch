/**
 * Optional structured metadata enrichment for field-anchor signals.
 *
 * Pipeline position: extract/assess — normalizes field_provenance on visits/PBO/field family signals.
 *
 * Owns: field_provenance attachment from known signal fields when missing.
 * Does NOT: extraction itself, gaming caps (signalGamingPolicy.js), or geo resolution.
 *
 * Key collaborators: ../../contracts/sourceFamilies.js, visitsSourceType.js, fieldReportHygiene.js, signalGamingPolicy.js, probeCorroborationPolicy.js.
 */
import { FIELD_FAMILY_SOURCE_TYPES } from '../../contracts/sourceFamilies.js';

const FIELD_SOURCE_TYPES = new Set(FIELD_FAMILY_SOURCE_TYPES);

function isFieldFamilySource(signal) {
  return FIELD_SOURCE_TYPES.has(signal?.source_type);
}

/**
 * Attach field_provenance from known signal fields when missing.
 *
 * @param {object} signal field-family signal instance
 * @param {object} [hints] optional overrides (officer_id, visit_locality, etc.)
 * @returns {object} signal copy with field_provenance populated
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
