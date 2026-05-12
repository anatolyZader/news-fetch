import { GEO_ENTITY_TYPES } from '../value_objects/geoEnrichmentSchema.js';

/** Types north-reference rows may declare via `geoEntityType` (geocoded pin semantics). */
const ROW_ALLOWED = new Set(['locality', 'municipality', 'regional_council']);

/**
 * Entity types for which lat/lon is a representative centroid only — not suitable for aggregate distance KPIs.
 * @type {ReadonlySet<string>}
 */
export const CENTROID_GEOMETRY_ONLY_ENTITY_TYPES = new Set([
  'regional_council',
  'district',
  'pbo_subregion',
  'area',
  'subregion',
  'border_zone',
]);

/**
 * @param {string} geoEntityType
 * @returns {'point_to_polyline' | 'representative_centroid_to_polyline'}
 */
export function distanceSemanticsForGeoEntityType(geoEntityType) {
  const t = String(geoEntityType ?? '').trim().toLowerCase();
  if (CENTROID_GEOMETRY_ONLY_ENTITY_TYPES.has(t) || t === 'municipality') {
    return 'representative_centroid_to_polyline';
  }
  return 'point_to_polyline';
}

/**
 * @param {unknown} hint
 * @param {string} fallback
 * @returns {string}
 */
export function coalesceGeoEntityTypeHint(hint, fallback) {
  const f = String(fallback ?? 'locality').trim().toLowerCase();
  if (hint == null || hint === '') return GEO_ENTITY_TYPES.has(f) ? f : 'locality';
  const t = String(hint).trim().toLowerCase();
  if (!GEO_ENTITY_TYPES.has(t)) return f;
  return t;
}

/**
 * @param {{ geoEntityType?: string | null } | null | undefined} row
 * @returns {string}
 */
export function resolveReferenceGeoEntityType(row) {
  const raw = row?.geoEntityType;
  if (raw == null || raw === '') return 'locality';
  const t = String(raw).trim().toLowerCase();
  if (ROW_ALLOWED.has(t)) return t;
  return 'locality';
}
