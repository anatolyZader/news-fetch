/**
 * Regional district assignment and default-north fallback for structured field sources.
 *
 * Pipeline position: assess — scope attribution before regionSignalFilter and evidenceEligibility.
 *
 * Owns: district_id normalization, north-only source defaults, explicit-vs-fallback district provenance.
 * Does NOT: geo resolution (geo module), scope filtering (regionSignalFilter.js), or metrics gating.
 *
 * Key collaborators: regionSignalFilter.js, scopeAttributionMetrics.js, evidenceEligibility.js, cross-cut-modules/geo/israelDistricts.js.
 */
import {
  ISRAEL_REGIONAL_DISTRICT_ORDER,
  normalizeIsraelDistrictId,
} from '../../../../../cross-cut-modules/geo/israelDistricts.js';

/**
 * Structured source types that are exclusively north-domain feeds.
 * When `district_id` is absent on a signal from these sources, north is the correct default.
 * Extractors should write `district_id: 'north'` explicitly; this constant is a safety net.
 */
export const DEFAULT_NORTH_SOURCE_TYPES = Object.freeze([
  'visits',
  'field', // read-compat for older bundles
  'field_whatsapp',
  'pbo',
  'pbo_regional',
  'naftali',
  'whatsapp',
]);

const DEFAULT_NORTH_SET = new Set(DEFAULT_NORTH_SOURCE_TYPES);

/**
 * Whether default-north fallback is enabled (env RESILIENCE_DEFAULT_NORTH_FALLBACK).
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean} true unless explicitly disabled
 */
export function isDefaultNorthFallbackEnabled(env = process.env) {
  const v = env.RESILIENCE_DEFAULT_NORTH_FALLBACK;
  if (v == null || v === '') return true;
  return v !== '0' && v !== 'false' && v !== 'off';
}

/**
 * Whether the source type belongs to the north-only structured feed family.
 *
 * @param {string} [sourceType]
 * @returns {boolean}
 */
export function isDefaultNorthSource(sourceType) {
  const st = String(sourceType ?? '').trim().toLowerCase();
  return st !== '' && DEFAULT_NORTH_SET.has(st);
}

/**
 * Explicit district on signal, or default-north for north-only structured source types.
 *
 * @param {object} signal
 * @returns {string|null} regional district id, or null for geo-only sources
 */
export function signalDistrictId(signal) {
  const raw = signal?.district_id;
  if (raw != null && String(raw).trim()) {
    const normalized = normalizeIsraelDistrictId(String(raw).trim());
    if (ISRAEL_REGIONAL_DISTRICT_ORDER.includes(normalized)) {
      return normalized;
    }
  }
  if (isDefaultNorthFallbackEnabled() && isDefaultNorthSource(signal?.source_type)) {
    return 'north';
  }
  return null;
}

/**
 * Whether the district id came from explicit signal.district_id (not default-north fallback).
 *
 * @param {object} signal
 * @returns {boolean}
 */
export function hasExplicitSignalDistrictId(signal) {
  const raw = signal?.district_id;
  if (raw == null || !String(raw).trim()) return false;
  const normalized = normalizeIsraelDistrictId(String(raw).trim());
  return ISRAEL_REGIONAL_DISTRICT_ORDER.includes(normalized);
}

/**
 * District id used for scope when signal matches via assigned district (not geo).
 *
 * @param {object} signal
 * @param {string} scopeId normalized report scope id
 * @returns {{ districtId: string, source: 'signal_district' | 'default_north_district' } | null}
 */
export function assignedDistrictScopeMatch(signal, scopeId) {
  const explicit = hasExplicitSignalDistrictId(signal);
  const districtId = signalDistrictId(signal);
  if (!districtId || districtId !== scopeId) return null;
  return {
    districtId,
    source: explicit ? 'signal_district' : 'default_north_district',
  };
}
