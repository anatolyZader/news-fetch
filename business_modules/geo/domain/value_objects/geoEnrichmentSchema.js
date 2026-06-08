/**
 * Structural validation for persisted `geo` envelopes (signals, reports).
 * v3: nested groups are canonical; flat root duplicates optional (legacy read only).
 */

import { GEO_PROVENANCE_VALUES } from './geoProvenance.js';
import { GEO_ENVELOPE_SCHEMA_VERSION } from './geoEnvelopeVersion.js';

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

function validateResolvedResolution(r, envelopeSchemaVersion, errors) {
  if (r == null || typeof r !== 'object') {
    errors.push('resolved.resolution must be an object');
    return;
  }
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
  if (envelopeSchemaVersion === GEO_ENVELOPE_SCHEMA_VERSION) {
    if (typeof r.provenance !== 'string' || !GEO_PROVENANCE_VALUES.has(r.provenance)) {
      errors.push('resolved.resolution.provenance required for current envelope schema');
    }
  }
}

function validateResolvedClassification(c, errors) {
  if (c == null || typeof c !== 'object') {
    errors.push('resolved.classification must be an object');
    return;
  }
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

function validateResolvedPolicy(p, errors) {
  if (p == null || typeof p !== 'object') {
    errors.push('resolved.policy must be an object');
    return;
  }
  if (typeof p.geoPolicyVersion !== 'string' || !p.geoPolicyVersion.trim()) errors.push('resolved.policy.geoPolicyVersion required');
  if (!QUALITIES.has(p.quality)) errors.push('resolved.policy.quality must be high|medium|low');
  if (typeof p.usableForMetrics !== 'boolean') errors.push('resolved.policy.usableForMetrics must be boolean');
  if (typeof p.requiresReview !== 'boolean') errors.push('resolved.policy.requiresReview must be boolean');
  if (!SCOPE_LEVELS.has(p.scopeConfidence)) errors.push('resolved.policy.scopeConfidence must be high|medium|low');
  if (p.decisionReasons != null && !Array.isArray(p.decisionReasons)) errors.push('resolved.policy.decisionReasons must be array when present');
}

function validateResolvedAudit(a, errors) {
  if (a == null || typeof a !== 'object') {
    errors.push('resolved.audit must be an object');
    return;
  }
  if (typeof a.geoReferenceVersion !== 'string' || !a.geoReferenceVersion.trim()) errors.push('resolved.audit.geoReferenceVersion required');
  if (a.borderReferenceVersion != null && typeof a.borderReferenceVersion !== 'string') errors.push('resolved.audit.borderReferenceVersion must be string|null');
  if (typeof a.source !== 'string' || !a.source.trim()) errors.push('resolved.audit.source required');
  if (typeof a.resolvedAt !== 'string' || !a.resolvedAt.trim()) errors.push('resolved.audit.resolvedAt required');
}

function validateResolvedMatchEvidence(me, errors) {
  if (me == null || typeof me !== 'object') {
    errors.push('resolved.matchEvidence must be an object');
    return;
  }
  if (typeof me.rawInput !== 'string') errors.push('resolved.matchEvidence.rawInput must be string');
  if (typeof me.normalizedInput !== 'string') errors.push('resolved.matchEvidence.normalizedInput must be string');
  if (typeof me.matchedVariant !== 'string' || !me.matchedVariant.trim()) {
    errors.push('resolved.matchEvidence.matchedVariant required');
  }
  if (!Number.isInteger(me.candidateCount) || me.candidateCount < 1) {
    errors.push('resolved.matchEvidence.candidateCount must be integer >= 1');
  }
}

function validateResolvedScopeDecision(sd, errors) {
  if (sd == null || typeof sd !== 'object') {
    errors.push('resolved.scopeDecision required');
    return;
  }
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

function validateResolvedLegacyFields(g, errors) {
  if (g.subregionId != null && typeof g.subregionId !== 'string') {
    errors.push('resolved.subregionId must be string when present');
  }
  if (g.pboSubregionId != null && typeof g.pboSubregionId !== 'string') {
    errors.push('resolved.pboSubregionId must be string when present');
  }
  if (g.matchMethod != null && !RESOLVED_METHODS.has(g.matchMethod)) {
    errors.push('resolved.matchMethod invalid when present');
  }
  if (g.quality != null && !QUALITIES.has(g.quality)) errors.push('resolved.quality invalid when present');
  if (g.usableForMetrics != null && typeof g.usableForMetrics !== 'boolean') {
    errors.push('resolved.usableForMetrics must be boolean when present');
  }
  if (g.requiresReview != null && typeof g.requiresReview !== 'boolean') {
    errors.push('resolved.requiresReview must be boolean when present');
  }
  if (g.scopeConfidence != null && !SCOPE_LEVELS.has(g.scopeConfidence)) {
    errors.push('resolved.scopeConfidence invalid when present');
  }
}

function validateResolvedGeo(g, errors) {
  if (typeof g.envelopeSchemaVersion !== 'string' || !g.envelopeSchemaVersion.trim()) {
    errors.push('resolved.envelopeSchemaVersion required');
  }
  if (!GEO_ENTITY_TYPES.has(g.geoEntityType)) errors.push('resolved.geoEntityType invalid');

  validateResolvedResolution(g.resolution, g.envelopeSchemaVersion, errors);
  validateResolvedClassification(g.classification, errors);
  validateResolvedPolicy(g.policy, errors);
  validateResolvedAudit(g.audit, errors);
  validateResolvedMatchEvidence(g.matchEvidence, errors);
  validateResolvedScopeDecision(g.scopeDecision, errors);
  validateResolvedLegacyFields(g, errors);
}

function validateUnknownGeo(g, errors) {
  if (g.envelopeSchemaVersion != null && typeof g.envelopeSchemaVersion !== 'string') {
    errors.push('unknown.envelopeSchemaVersion must be string when present');
  }
  if (typeof g.reason !== 'string' || !g.reason.trim()) errors.push('unknown.reason required');
  if (g.geoReferenceVersion != null && typeof g.geoReferenceVersion !== 'string') {
    errors.push('unknown.geoReferenceVersion must be string or null');
  }
  if (g.resolution != null && typeof g.resolution !== 'object') errors.push('unknown.resolution must be object when present');
  if (g.audit != null && typeof g.audit !== 'object') errors.push('unknown.audit must be object when present');
}

function validateProvisionalGeo(g, errors) {
  if (typeof g.envelopeSchemaVersion !== 'string' || !g.envelopeSchemaVersion.trim()) {
    errors.push('provisional.envelopeSchemaVersion required');
  }
  if (!GEO_ENTITY_TYPES.has(g.geoEntityType)) errors.push('provisional.geoEntityType invalid');
  const r = g.resolution;
  if (r == null || typeof r !== 'object') {
    errors.push('provisional.resolution must be an object');
    return;
  }
  if (typeof r.rawInput !== 'string') errors.push('provisional.resolution.rawInput must be string');
  if (typeof r.probableSubregionId !== 'string' || !r.probableSubregionId.trim()) {
    errors.push('provisional.resolution.probableSubregionId required');
  }
  if (r.matchMethod !== 'landmark_gazetteer') errors.push('provisional.resolution.matchMethod must be landmark_gazetteer');
  if (!Number.isFinite(r.matchConfidence)) errors.push('provisional.resolution.matchConfidence must be number');
  validateResolvedClassification(g.classification, errors);
  validateResolvedPolicy(g.policy, errors);
  if (g.policy?.usableForMetrics !== false) errors.push('provisional.policy.usableForMetrics must be false');
  if (g.policy?.requiresReview !== true) errors.push('provisional.policy.requiresReview must be true');
  validateResolvedAudit(g.audit, errors);
  if (g.scopeDecision != null) validateResolvedScopeDecision(g.scopeDecision, errors);
}

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
    validateResolvedGeo(g, errors);
  } else if (kind === 'unknown') {
    validateUnknownGeo(g, errors);
  } else if (kind === 'provisional') {
    validateProvisionalGeo(g, errors);
  } else {
    errors.push('geo.kind must be resolved, unknown, or provisional');
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: g };
}
