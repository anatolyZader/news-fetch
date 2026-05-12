import { CENTROID_GEOMETRY_ONLY_ENTITY_TYPES } from './referenceGeoEntityType.js';

/** Fuzzy matches at or above this confidence are allowed in aggregate metrics. */
export const FUZZY_METRICS_MIN_CONFIDENCE = 0.95;
/** Version string for policy decisions (thresholds, review rules, banding semantics). */
export const GEO_POLICY_VERSION = 'geo-policy-2026-05-v2';

/**
 * Derived consumer-facing fields so callers do not re-implement match rules.
 * @param {{ matchMethod: string, matchConfidence: number, geoEntityType?: string }} p
 * @returns {{ quality: 'high' | 'medium' | 'low', usableForMetrics: boolean, requiresReview: boolean }}
 */
export function deriveGeoQualityFields({ matchMethod, matchConfidence, geoEntityType }) {
  const method = String(matchMethod ?? 'exact');
  const conf = Number(matchConfidence);
  const safeConf = Number.isFinite(conf) ? conf : 0;

  const deterministic =
    method === 'exact' ||
    method === 'punctuation' ||
    method === 'hebrew_final' ||
    method === 'alias' ||
    method === 'manual_override';
  const isFuzzy = method === 'fuzzy';

  let quality = 'low';
  if (deterministic) quality = 'high';
  else if (isFuzzy && safeConf >= FUZZY_METRICS_MIN_CONFIDENCE) quality = 'medium';
  else if (isFuzzy) quality = 'low';

  let usableForMetrics = deterministic || (isFuzzy && safeConf >= FUZZY_METRICS_MIN_CONFIDENCE);
  let requiresReview = isFuzzy || quality === 'low';

  const entity = String(geoEntityType ?? 'locality').trim().toLowerCase();
  if (CENTROID_GEOMETRY_ONLY_ENTITY_TYPES.has(entity)) {
    usableForMetrics = false;
    requiresReview = true;
    if (quality === 'high') quality = 'medium';
  }

  return { quality, usableForMetrics, requiresReview };
}

/**
 * How much to trust this row for **north-scoped analytics** (separate from string `matchConfidence`).
 * v1: derived from metrics policy only; may later incorporate `sourceType`, regional hints, or entity type.
 * @param {{ usableForMetrics: boolean, requiresReview: boolean }} p
 * @returns {'high' | 'medium' | 'low'}
 */
export function deriveScopeConfidence({ usableForMetrics, requiresReview }) {
  if (!usableForMetrics) return 'low';
  if (requiresReview) return 'medium';
  return 'high';
}
