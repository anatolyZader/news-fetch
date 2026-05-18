/**
 * Structural validation for persisted `geo` envelopes (signals, reports).
 * Keeps drift visible without requiring Zod.
 */

const RESOLVED_METHODS = new Set(['exact', 'punctuation', 'hebrew_final', 'alias', 'manual_override', 'fuzzy']);
const QUALITIES = new Set(['high', 'medium', 'low']);
const SCOPE_LEVELS = new Set(['high', 'medium', 'low']);
/** @type {ReadonlySet<string>} */
export const GEO_ENTITY_TYPES = new Set([
  'locality',
  'municipality',
  'regional_council',
  'pbo_subregion',
  'district',
  'area',
  'subregion',
  'border_zone',
  'facility',
  'unknown',
]);
const NESTED_METHODS = new Set(['exact', 'punctuation', 'hebrew_final', 'alias', 'manual_override', 'fuzzy']);

/** When present on `classification`, documents how `distanceKmToNorthBorder` was derived. */
export const DISTANCE_SEMANTICS = new Set(['point_to_polyline', 'representative_centroid_to_polyline']);

/** `geo.scopeDecision.source` — geo-only audit (subset of full signal scope sources). */
export const GEO_SCOPE_DECISION_SOURCES = new Set(['geo', 'geo_tags', 'pbo_subregion', 'unknown']);

const RESOLUTION_SCOPES = new Set(['message', 'signal']);

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
    if (g.envelopeSchemaVersion != null && typeof g.envelopeSchemaVersion !== 'string') {
      errors.push('resolved.envelopeSchemaVersion must be string when present');
    }
    if (!GEO_ENTITY_TYPES.has(g.geoEntityType)) errors.push('resolved.geoEntityType invalid');
    if (!SCOPE_LEVELS.has(g.scopeConfidence)) errors.push('resolved.scopeConfidence must be high|medium|low');
    if (typeof g.geoPolicyVersion !== 'string' || !g.geoPolicyVersion.trim()) {
      errors.push('resolved.geoPolicyVersion must be a non-empty string');
    }
    // Nested shape (dual-write): validate when present.
    if (g.resolution != null) {
      const r = g.resolution;
      if (r == null || typeof r !== 'object') errors.push('resolved.resolution must be an object');
      else {
        if (typeof r.rawInput !== 'string') errors.push('resolved.resolution.rawInput must be string');
        if (typeof r.normalizedInput !== 'string') errors.push('resolved.resolution.normalizedInput must be string');
        if (typeof r.canonicalKey !== 'string' || !r.canonicalKey.trim()) errors.push('resolved.resolution.canonicalKey required');
        if (typeof r.matchedName !== 'string' || !r.matchedName.trim()) errors.push('resolved.resolution.matchedName required');
        if (typeof r.matchedVariant !== 'string' || !r.matchedVariant.trim()) errors.push('resolved.resolution.matchedVariant required');
        if (typeof r.matchMethod !== 'string' || !NESTED_METHODS.has(r.matchMethod)) errors.push('resolved.resolution.matchMethod invalid');
        if (!Number.isFinite(r.matchConfidence)) errors.push('resolved.resolution.matchConfidence must be number');
        if (!Number.isInteger(r.candidateCount) || r.candidateCount < 1) errors.push('resolved.resolution.candidateCount must be integer >= 1');
        if (!GEO_ENTITY_TYPES.has(r.geoEntityType)) errors.push('resolved.resolution.geoEntityType invalid');
        if (r.scope != null && !RESOLUTION_SCOPES.has(r.scope)) {
          errors.push('resolved.resolution.scope must be message|signal when present');
        }
      }
    }
    if (g.classification != null) {
      const c = g.classification;
      if (c == null || typeof c !== 'object') errors.push('resolved.classification must be an object');
      else {
        if (typeof c.pboSubregionId !== 'string' || !c.pboSubregionId.trim()) errors.push('resolved.classification.pboSubregionId required');
        if (!Array.isArray(c.geoAreaTags)) errors.push('resolved.classification.geoAreaTags must be an array');
        if (typeof c.isGolan !== 'boolean') errors.push('resolved.classification.isGolan must be boolean');
        if (!Number.isFinite(c.distanceKmToNorthBorder)) errors.push('resolved.classification.distanceKmToNorthBorder must be number');
        if (typeof c.distanceBand !== 'string' || !c.distanceBand.trim()) errors.push('resolved.classification.distanceBand required');
        if (c.distanceSemantics != null) {
          if (typeof c.distanceSemantics !== 'string' || !DISTANCE_SEMANTICS.has(c.distanceSemantics)) {
            errors.push('resolved.classification.distanceSemantics invalid');
          }
        }
      }
    }
    if (g.policy != null) {
      const p = g.policy;
      if (p == null || typeof p !== 'object') errors.push('resolved.policy must be an object');
      else {
        if (typeof p.geoPolicyVersion !== 'string' || !p.geoPolicyVersion.trim()) errors.push('resolved.policy.geoPolicyVersion required');
        if (!QUALITIES.has(p.quality)) errors.push('resolved.policy.quality must be high|medium|low');
        if (typeof p.usableForMetrics !== 'boolean') errors.push('resolved.policy.usableForMetrics must be boolean');
        if (typeof p.requiresReview !== 'boolean') errors.push('resolved.policy.requiresReview must be boolean');
        if (!SCOPE_LEVELS.has(p.scopeConfidence)) errors.push('resolved.policy.scopeConfidence must be high|medium|low');
        if (p.decisionReasons != null && !Array.isArray(p.decisionReasons)) errors.push('resolved.policy.decisionReasons must be array when present');
      }
    }
    if (g.audit != null) {
      const a = g.audit;
      if (a == null || typeof a !== 'object') errors.push('resolved.audit must be an object');
      else {
        if (typeof a.geoReferenceVersion !== 'string' || !a.geoReferenceVersion.trim()) errors.push('resolved.audit.geoReferenceVersion required');
        if (a.borderReferenceVersion != null && typeof a.borderReferenceVersion !== 'string') errors.push('resolved.audit.borderReferenceVersion must be string|null');
        if (typeof a.source !== 'string' || !a.source.trim()) errors.push('resolved.audit.source required');
        if (typeof a.resolvedAt !== 'string' || !a.resolvedAt.trim()) errors.push('resolved.audit.resolvedAt required');
      }
    }
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
    const sd = g.scopeDecision;
    if (sd == null || typeof sd !== 'object') {
      errors.push('resolved.scopeDecision required');
    } else {
      if (typeof sd.isNorthRelevant !== 'boolean') errors.push('resolved.scopeDecision.isNorthRelevant must be boolean');
      if (typeof sd.source !== 'string' || !GEO_SCOPE_DECISION_SOURCES.has(sd.source)) {
        errors.push('resolved.scopeDecision.source invalid');
      }
      if (!SCOPE_LEVELS.has(sd.confidence)) errors.push('resolved.scopeDecision.confidence must be high|medium|low');
      if (typeof sd.usableForMetrics !== 'boolean') {
        errors.push('resolved.scopeDecision.usableForMetrics must be boolean');
      }
      if (!Array.isArray(sd.reasons) || !sd.reasons.every((x) => typeof x === 'string')) {
        errors.push('resolved.scopeDecision.reasons must be string[]');
      }
    }
  } else if (kind === 'unknown') {
    if (g.envelopeSchemaVersion != null && typeof g.envelopeSchemaVersion !== 'string') {
      errors.push('unknown.envelopeSchemaVersion must be string when present');
    }
    if (typeof g.reason !== 'string' || !g.reason.trim()) errors.push('unknown.reason required');
    if (g.geoReferenceVersion != null && typeof g.geoReferenceVersion !== 'string') {
      errors.push('unknown.geoReferenceVersion must be string or null');
    }
    if (g.resolution != null && typeof g.resolution !== 'object') errors.push('unknown.resolution must be object when present');
    if (g.audit != null && typeof g.audit !== 'object') errors.push('unknown.audit must be object when present');
  } else {
    errors.push('geo.kind must be resolved or unknown');
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: g };
}
