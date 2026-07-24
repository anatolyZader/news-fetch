/**
 * Visits module source-type normalization and read-compat for legacy `field` keys.
 *
 * Pipeline position: extract/assess — source key normalization before pipeline routing and field policies.
 *
 * Owns: visits/field/field_whatsapp source type checks and canonical pipeline keys.
 * Does NOT: field provenance enrichment (fieldSignalPolicy.js) or district defaults (signalDistrictId.js).
 *
 * Key collaborators: ../../contracts/sourceFamilies.js, fieldSignalPolicy.js, signalDistrictId.js, fieldReportHygiene.js, composition ingest config.
 */
import { VISITS_SOURCE_TYPES } from '../../contracts/sourceFamilies.js';

const VISITS_SET = new Set(VISITS_SOURCE_TYPES);

/**
 * Whether the source type belongs to the visits/field family.
 *
 * @param {string} [sourceType]
 * @returns {boolean}
 */
export function isVisitsSourceType(sourceType) {
  return VISITS_SET.has(String(sourceType ?? ''));
}

/**
 * Canonical pipeline/assess source key (legacy bundles/configs may still say `field`).
 *
 * @param {string} [sourceType]
 * @returns {string} normalized source type (`field` → `visits`)
 */
export function normalizeVisitsSourceType(sourceType) {
  const t = String(sourceType ?? '');
  if (t === 'field') return 'visits';
  return t;
}

/**
 * Normalize a pipeline config source key to its canonical form.
 *
 * @param {string} [configKey]
 * @returns {string}
 */
export function normalizePipelineSourceKey(configKey) {
  const k = String(configKey ?? '');
  if (k === 'field') return 'visits';
  return k;
}
