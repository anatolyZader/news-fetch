import {
  ISRAEL_NATIONAL_DISTRICT_ID,
  israelDistrictLabelKey,
} from '../../../../cross-cut-modules/geo/israelDistricts.js';
import { normalizeReportScopeId } from '../../../../cross-cut-modules/geo/reportScopeIds.js';
import {
  districtRelevanceFromResolvedGeo,
  homeFrontDistrictIdsFromResolvedGeo,
} from '../../../../business_modules/geo/index.js';
import {
  assignedDistrictScopeMatch,
  hasExplicitSignalDistrictId,
  signalDistrictId,
} from './signals/signalDistrictId.js';
import { recordDefaultNorthFallback } from './scopeAttributionMetrics.js';

/**
 * District ids implied by signal district assignment and resolved geo.
 * @param {object} signal
 * @returns {string[]}
 */
export function deriveHomeFrontDistricts(signal) {
  const ids = new Set();
  const assigned = signalDistrictId(signal);
  if (assigned) ids.add(assigned);
  if (signal?.geo?.kind === 'resolved') {
    for (const id of homeFrontDistrictIdsFromResolvedGeo(signal.geo)) {
      ids.add(id);
    }
  }
  return [...ids];
}

/**
 * Explainable scope-relevance decision trace for a target report scope.
 * @param {object} signal
 * @param {string} [targetScopeId]
 * @returns {{
 *   isScopeRelevant: boolean,
 *   isNorthRelevant: boolean,
 *   source: string,
 *   confidence: 'high'|'medium'|'low',
 *   reasons: string[],
 *   homeFrontDistricts: string[],
 * }}
 */
export function scopeDecisionForSignal(signal, targetScopeId = ISRAEL_NATIONAL_DISTRICT_ID) {
  const scopeId = normalizeReportScopeId(targetScopeId);
  const homeFrontDistricts = deriveHomeFrontDistricts(signal);
  const reasons = [];

  if (scopeId === ISRAEL_NATIONAL_DISTRICT_ID) {
    return {
      isScopeRelevant: true,
      isNorthRelevant: homeFrontDistricts.includes('north'),
      source: 'national',
      confidence: 'high',
      reasons: ['scope=national'],
      homeFrontDistricts,
    };
  }

  const assigned = assignedDistrictScopeMatch(signal, scopeId);
  if (assigned) {
    const explicit = hasExplicitSignalDistrictId(signal);
    if (assigned.source === 'default_north_district') {
      recordDefaultNorthFallback(1);
    }
    reasons.push(
      `signal_district=${assigned.districtId}${explicit ? '' : ' (default_north_district)'}`,
    );
    return {
      isScopeRelevant: true,
      isNorthRelevant: scopeId === 'north',
      source: assigned.source,
      confidence: 'high',
      reasons,
      homeFrontDistricts,
    };
  }

  const g = signal?.geo;
  if (g?.kind === 'resolved') {
    const geo = districtRelevanceFromResolvedGeo(scopeId, g);
    reasons.push(...geo.reasons);
    return {
      isScopeRelevant: geo.isRelevant,
      isNorthRelevant: scopeId === 'north' && geo.isRelevant,
      source: geo.source,
      confidence: geo.confidence,
      reasons,
      homeFrontDistricts,
    };
  }

  reasons.push('no signal_district or resolved geo for target scope');
  return {
    isScopeRelevant: false,
    isNorthRelevant: false,
    source: 'unknown',
    confidence: 'low',
    reasons,
    homeFrontDistricts,
  };
}

/** @deprecated use scopeDecisionForSignal(signal, 'north') */
export function isNorthSignal(signal) {
  return scopeDecisionForSignal(signal, 'north').isScopeRelevant;
}

export function filterSignalsForScope(signals, scope) {
  const scopeId = normalizeReportScopeId(scope);
  const out = (signals ?? []).map((s) => {
    const d = scopeDecisionForSignal(s, scopeId);
    const merged = s && typeof s === 'object' ? { ...s, scopeDecision: d } : s;
    if (merged?.scopeDecision?.macro_scope === 'national') {
      merged.macro_scope = 'national';
    }
    return merged;
  });
  if (scopeId === ISRAEL_NATIONAL_DISTRICT_ID) return out;
  return out.filter((s) => s?.scopeDecision?.isScopeRelevant);
}

export function normalizeReportScope(scope) {
  return normalizeReportScopeId(scope);
}

const REGIONAL_SCOPE_LABELS = Object.freeze({
  north: 'Northern Israel',
  south: 'Southern Israel',
  jerusalem: 'Jerusalem District',
  dan: 'Dan District',
  haifa: 'Haifa District',
});

export function reportScopeMetadata(scope) {
  const id = normalizeReportScopeId(scope);
  if (id === ISRAEL_NATIONAL_DISTRICT_ID) {
    return { id: ISRAEL_NATIONAL_DISTRICT_ID, label: 'National', comparison_scope: null };
  }
  return {
    id,
    label: REGIONAL_SCOPE_LABELS[id] ?? id,
    labelKey: israelDistrictLabelKey(id),
    comparison_scope: ISRAEL_NATIONAL_DISTRICT_ID,
  };
}

export { isRegionalReportScope } from '../../../../cross-cut-modules/geo/reportScopeIds.js';
export { ISRAEL_REGIONAL_DISTRICT_ORDER as REGIONAL_REPORT_SCOPE_IDS } from '../../../../cross-cut-modules/geo/israelDistricts.js';
