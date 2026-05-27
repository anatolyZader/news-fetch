import { CENTROID_GEOMETRY_ONLY_ENTITY_TYPES } from './referenceGeoEntityType.js';
import { GEO_PROVENANCE, TEXT_INFERENCE_SOURCE_TYPES } from '../value_objects/geoProvenance.js';

/** Fuzzy matches at or above this confidence are allowed in aggregate metrics. */
export const FUZZY_METRICS_MIN_CONFIDENCE = 0.95;
/** Version string for policy decisions (thresholds, review rules, banding semantics). */
export const GEO_POLICY_VERSION = 'geo-policy-2026-05-v3';

/**
 * Derived consumer-facing fields so callers do not re-implement match rules.
 * @param {{
 *   matchMethod: string,
 *   matchConfidence: number,
 *   geoEntityType?: string,
 *   provenance?: string,
 *   sourceType?: string,
 * }} p
 * @returns {{ quality: 'high' | 'medium' | 'low', usableForMetrics: boolean, requiresReview: boolean, policyReasons: string[] }}
 */
export function deriveGeoQualityFields({ matchMethod, matchConfidence, geoEntityType, provenance, sourceType }) {
  const method = String(matchMethod ?? 'exact');
  const conf = Number(matchConfidence);
  const safeConf = Number.isFinite(conf) ? conf : 0;
  /** @type {string[]} */
  const policyReasons = [];

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
    policyReasons.push('centroid_geometry_only');
  }

  const prov = String(provenance ?? GEO_PROVENANCE.direct).trim();
  const st = String(sourceType ?? '').trim().toLowerCase();
  if (prov === GEO_PROVENANCE.text_inferred && TEXT_INFERENCE_SOURCE_TYPES.has(st)) {
    usableForMetrics = false;
    requiresReview = true;
    if (quality === 'high') quality = 'medium';
    policyReasons.push('text_inferred_source');
  }

  if (deterministic) policyReasons.push('deterministic_match');
  else if (isFuzzy) policyReasons.push(`fuzzy>=${FUZZY_METRICS_MIN_CONFIDENCE}`);
  if (method === 'manual_override') {
    policyReasons.length = 0;
    policyReasons.push('manual_override');
  }

  return { quality, usableForMetrics, requiresReview, policyReasons };
}

/**
 * How much to trust this row for **north-scoped analytics** (separate from string `matchConfidence`).
 * @param {{ usableForMetrics: boolean, requiresReview: boolean }} p
 * @returns {'high' | 'medium' | 'low'}
 */
export function deriveScopeConfidence({ usableForMetrics, requiresReview }) {
  if (!usableForMetrics) return 'low';
  if (requiresReview) return 'medium';
  return 'high';
}
