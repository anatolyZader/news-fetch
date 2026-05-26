import { northRelevanceFromResolvedGeo } from '../../../../cross-cut-modules/geo/northRelevanceFromResolvedGeo.js';

const ALWAYS_NORTH_SOURCE_TYPES = new Set(['field', 'pbo', 'pbo_regional', 'naftali', 'whatsapp']);

/**
 * Explainable north-relevance decision trace.
 * North scope requires resolved geo (via geoService) or always-north source types — no text keyword fallback.
 * @param {object} signal
 * @returns {{ isNorthRelevant: boolean, source: string, confidence: 'high'|'medium'|'low', reasons: string[] }}
 */
export function scopeDecisionForSignal(signal) {
  const reasons = [];
  if (ALWAYS_NORTH_SOURCE_TYPES.has(signal?.source_type)) {
    reasons.push(`source_type=${signal?.source_type}`);
    return { isNorthRelevant: true, source: 'source_type', confidence: 'high', reasons };
  }
  const g = signal?.geo;
  if (g?.kind === 'resolved') {
    const geoNorth = northRelevanceFromResolvedGeo(g);
    return {
      isNorthRelevant: geoNorth.isNorthRelevant,
      source: geoNorth.source,
      confidence: geoNorth.confidence,
      reasons: [...geoNorth.reasons],
    };
  }
  return { isNorthRelevant: false, source: 'unknown', confidence: 'low', reasons };
}

export function isNorthSignal(signal) {
  return scopeDecisionForSignal(signal).isNorthRelevant;
}

export function filterSignalsForScope(signals, scope) {
  const out = (signals ?? []).map((s) => {
    const d = scopeDecisionForSignal(s);
    const merged = s && typeof s === 'object' ? { ...s, scopeDecision: d } : s;
    if (merged?.scopeDecision?.macro_scope === 'national') {
      merged.macro_scope = 'national';
    }
    return merged;
  });
  if (scope === 'north') return out.filter((s) => s?.scopeDecision?.isNorthRelevant);
  return out;
}

export function normalizeReportScope(scope) {
  return scope === 'north' ? 'north' : 'national';
}

export function reportScopeMetadata(scope) {
  return normalizeReportScope(scope) === 'north'
    ? { id: 'north', label: 'Northern Israel', comparison_scope: 'national' }
    : { id: 'national', label: 'National' };
}
