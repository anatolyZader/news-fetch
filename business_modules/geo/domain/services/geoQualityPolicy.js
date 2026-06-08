import { CENTROID_GEOMETRY_ONLY_ENTITY_TYPES } from './referenceGeoEntityType.js';
import { GEO_PROVENANCE, TEXT_INFERENCE_SOURCE_TYPES } from '../value_objects/geoProvenance.js';

/** Fuzzy matches at or above this confidence are allowed in aggregate metrics. */
export const FUZZY_METRICS_MIN_CONFIDENCE = 0.95;
/** Version string for policy decisions (thresholds, review rules, banding semantics). */
export const GEO_POLICY_VERSION = 'geo-policy-2026-05-v3';

const DETERMINISTIC_METHODS = new Set(['exact', 'punctuation', 'hebrew_final', 'alias', 'manual_override']);

function baseQualityFromMatch(method, safeConf) {
  if (DETERMINISTIC_METHODS.has(method)) return 'high';
  if (method === 'fuzzy' && safeConf >= FUZZY_METRICS_MIN_CONFIDENCE) return 'medium';
  return 'low';
}

function applyCentroidGeometryPolicy(entity, state) {
  if (!CENTROID_GEOMETRY_ONLY_ENTITY_TYPES.has(entity)) return state;
  return {
    quality: state.quality === 'high' ? 'medium' : state.quality,
    usableForMetrics: false,
    requiresReview: true,
    policyReasons: [...state.policyReasons, 'centroid_geometry_only'],
  };
}

function applyTextInferredPolicy(provenance, sourceType, state) {
  const prov = String(provenance ?? GEO_PROVENANCE.direct).trim();
  const st = String(sourceType ?? '').trim().toLowerCase();
  if (prov !== GEO_PROVENANCE.text_inferred || !TEXT_INFERENCE_SOURCE_TYPES.has(st)) return state;
  return {
    quality: state.quality === 'high' ? 'medium' : state.quality,
    usableForMetrics: false,
    requiresReview: true,
    policyReasons: [...state.policyReasons, 'text_inferred_source'],
  };
}

function matchPolicyReasons(method) {
  if (DETERMINISTIC_METHODS.has(method)) return ['deterministic_match'];
  if (method === 'fuzzy') return [`fuzzy>=${FUZZY_METRICS_MIN_CONFIDENCE}`];
  return [];
}

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
  const isFuzzy = method === 'fuzzy';
  const deterministic = DETERMINISTIC_METHODS.has(method);
  const baseQuality = baseQualityFromMatch(method, safeConf);

  let state = {
    quality: baseQuality,
    usableForMetrics: deterministic || (isFuzzy && safeConf >= FUZZY_METRICS_MIN_CONFIDENCE),
    requiresReview: isFuzzy || baseQuality === 'low',
    policyReasons: [],
  };

  const entity = String(geoEntityType ?? 'locality').trim().toLowerCase();
  state = applyCentroidGeometryPolicy(entity, state);
  state = applyTextInferredPolicy(provenance, sourceType, state);
  state.policyReasons = method === 'manual_override'
    ? ['manual_override']
    : [...state.policyReasons, ...matchPolicyReasons(method)];

  return state;
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
