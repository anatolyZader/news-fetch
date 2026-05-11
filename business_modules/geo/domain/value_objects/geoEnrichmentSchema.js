/**
 * Structural validation for persisted `geo` envelopes (signals, reports).
 * Keeps drift visible without requiring Zod.
 */

const RESOLVED_METHODS = new Set(['exact', 'punctuation', 'hebrew_final', 'alias', 'fuzzy']);
const QUALITIES = new Set(['high', 'medium', 'low']);
const SCOPE_LEVELS = new Set(['high', 'medium', 'low']);
const GEO_ENTITY_TYPES = new Set(['locality', 'municipality', 'regional_council', 'area', 'subregion', 'unknown']);

/**
 * @param {unknown} g
 * @returns {{ ok: true, value: object } | { ok: false, errors: string[] }}
 */
export function validateGeoEnvelope(g) {
  const errors = [];
  if (g == null || typeof g !== 'object') {
    return { ok: false, errors: ['geo must be a non-null object'] };
  }
  const kind = g.kind;
  if (kind === 'resolved') {
    if (!GEO_ENTITY_TYPES.has(g.geoEntityType)) errors.push('resolved.geoEntityType invalid');
    if (!SCOPE_LEVELS.has(g.scopeConfidence)) errors.push('resolved.scopeConfidence must be high|medium|low');
    const me = g.matchEvidence;
    if (me == null || typeof me !== 'object') {
      errors.push('resolved.matchEvidence must be an object');
    } else {
      if (typeof me.rawInput !== 'string') errors.push('resolved.matchEvidence.rawInput must be string');
      if (typeof me.normalizedInput !== 'string') errors.push('resolved.matchEvidence.normalizedInput must be string');
      if (typeof me.matchedVariant !== 'string' || !me.matchedVariant.trim()) {
        errors.push('resolved.matchEvidence.matchedVariant required');
      }
      if (!Number.isInteger(me.candidateCount) || me.candidateCount < 1) {
        errors.push('resolved.matchEvidence.candidateCount must be integer >= 1');
      }
    }
    if (g.subregionId != null && typeof g.subregionId !== 'string') {
      errors.push('resolved.subregionId must be string when present');
    }
    if (typeof g.geoReferenceVersion !== 'string' || !g.geoReferenceVersion.trim()) {
      errors.push('resolved.geoReferenceVersion must be a non-empty string');
    }
    if (typeof g.canonicalKey !== 'string' || !g.canonicalKey.trim()) errors.push('resolved.canonicalKey required');
    if (typeof g.pboSubregionId !== 'string' || !g.pboSubregionId.trim()) {
      errors.push('resolved.pboSubregionId required');
    }
    if (typeof g.matchMethod !== 'string' || !RESOLVED_METHODS.has(g.matchMethod)) {
      errors.push('resolved.matchMethod invalid');
    }
    if (!Number.isFinite(g.matchConfidence)) errors.push('resolved.matchConfidence must be a number');
    if (!QUALITIES.has(g.quality)) errors.push('resolved.quality must be high|medium|low');
    if (typeof g.usableForMetrics !== 'boolean') errors.push('resolved.usableForMetrics must be boolean');
    if (typeof g.requiresReview !== 'boolean') errors.push('resolved.requiresReview must be boolean');
    if (!Array.isArray(g.geoAreaTags)) errors.push('resolved.geoAreaTags must be an array');
  } else if (kind === 'unknown') {
    if (typeof g.reason !== 'string' || !g.reason.trim()) errors.push('unknown.reason required');
    if (g.geoReferenceVersion != null && typeof g.geoReferenceVersion !== 'string') {
      errors.push('unknown.geoReferenceVersion must be string or null');
    }
  } else {
    errors.push('geo.kind must be resolved or unknown');
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: g };
}
