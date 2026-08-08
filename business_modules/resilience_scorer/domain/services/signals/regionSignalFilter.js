/**
 * Report-scope filtering and explainable scope-relevance decisions for signals.
 *
 * Pipeline position: assess — after district/geo enrichment, before evidenceEligibility partition.
 *
 * Owns: scopeDecision traces, filterSignalsForScope, report scope metadata for user surfaces.
 * Does NOT: district default-north logic (signalDistrictId.js), metrics gating, or geo resolution rules.
 *
 * Key collaborators: signalDistrictId.js, scopeAttributionMetrics.js, evidenceEligibility.js, business_modules/geo/index.js.
 */
import {
  ISRAEL_NATIONAL_DISTRICT_ID,
  israelDistrictLabelKey,
} from '../../../../../cross-cut-modules/geo/israelDistricts.js';
import { normalizeReportScopeId } from '../../../../../cross-cut-modules/geo/reportScopeIds.js';
import {
  districtRelevanceFromResolvedGeo,
  homeFrontDistrictIdsFromResolvedGeo,
} from '../../../../../business_modules/geo/index.js';
import {
  assignedDistrictScopeMatch,
  hasExplicitSignalDistrictId,
  signalDistrictId,
} from './signalDistrictId.js';

/**
 * District ids implied by signal district assignment and resolved geo.
 *
 * @param {object} signal
 * @returns {string[]} home-front district ids for this signal
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
 *
 * @param {object} signal
 * @param {string} [targetScopeId] normalized scope id (default national)
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

/**
 * Stamp scopeDecision on every signal (reuses an existing scopeDecision when present).
 *
 * @param {object[]} signals
 * @param {string} scope report scope id
 * @returns {object[]} signals with scopeDecision attached
 */
export function annotateScopeDecisions(signals, scope) {
  const scopeId = normalizeReportScopeId(scope);
  return (signals ?? []).map((s) => {
    if (!s || typeof s !== 'object') return s;
    if (s.scopeDecision) return s;
    return { ...s, scopeDecision: scopeDecisionForSignal(s, scopeId) };
  });
}

/**
 * Attach scopeDecision to each signal and filter to scope-relevant instances (regional scopes only).
 *
 * @param {object[]} signals
 * @param {string} scope report scope id
 * @returns {object[]} scoped signals with scopeDecision attached
 */
export function filterSignalsForScope(signals, scope) {
  const scopeId = normalizeReportScopeId(scope);
  const out = annotateScopeDecisions(signals, scopeId);
  if (scopeId === ISRAEL_NATIONAL_DISTRICT_ID) return out;
  return out.filter((s) => s?.scopeDecision?.isScopeRelevant);
}

/**
 * Normalize a report scope string to its canonical id.
 *
 * @param {string} scope
 * @returns {string}
 */
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

/**
 * User-facing metadata for a report scope (label, comparison scope).
 *
 * @param {string} scope
 * @returns {{ id: string, label: string, labelKey?: string, comparison_scope: string|null }}
 */
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

export { isRegionalReportScope } from '../../../../../cross-cut-modules/geo/reportScopeIds.js';
export { ISRAEL_REGIONAL_DISTRICT_ORDER as REGIONAL_REPORT_SCOPE_IDS } from '../../../../../cross-cut-modules/geo/israelDistricts.js';
