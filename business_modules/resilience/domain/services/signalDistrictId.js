import {
  ISRAEL_REGIONAL_DISTRICT_ORDER,
  normalizeIsraelDistrictId,
} from '../../../../cross-cut-modules/geo/israelDistricts.js';

/** Structured feeds that default to north when district_id is absent (legacy bundles). */
export const LEGACY_NORTH_STRUCTURED_SOURCE_TYPES = Object.freeze([
  'field',
  'field_whatsapp',
  'pbo',
  'pbo_regional',
  'naftali',
  'whatsapp',
]);

const LEGACY_NORTH_SET = new Set(LEGACY_NORTH_STRUCTURED_SOURCE_TYPES);

/**
 * @param {string} [sourceType]
 * @returns {boolean}
 */
export function isLegacyNorthStructuredSource(sourceType) {
  const st = String(sourceType ?? '').trim().toLowerCase();
  return st !== '' && LEGACY_NORTH_SET.has(st);
}

/**
 * Explicit district on signal, or legacy north fallback for structured source types.
 * @param {object} signal
 * @returns {string | null} regional district id, or null for geo-only sources
 */
export function signalDistrictId(signal) {
  const raw = signal?.district_id;
  if (raw != null && String(raw).trim()) {
    const normalized = normalizeIsraelDistrictId(String(raw).trim());
    if (ISRAEL_REGIONAL_DISTRICT_ORDER.includes(normalized)) {
      return normalized;
    }
  }
  if (isLegacyNorthStructuredSource(signal?.source_type)) {
    return 'north';
  }
  return null;
}

/**
 * Whether the district id came from explicit signal.district_id (not legacy fallback).
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
 * @param {object} signal
 * @returns {{ districtId: string, source: 'signal_district' | 'legacy_north_fallback' } | null}
 */
export function assignedDistrictScopeMatch(signal, scopeId) {
  const explicit = hasExplicitSignalDistrictId(signal);
  const districtId = signalDistrictId(signal);
  if (!districtId || districtId !== scopeId) return null;
  return {
    districtId,
    source: explicit ? 'signal_district' : 'legacy_north_fallback',
  };
}
