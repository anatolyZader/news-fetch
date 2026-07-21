/**
 * Epistemic eligibility — which signals may drive component metrics vs scope/narrative context.
 *
 * Pipeline position: assess — after filterSignalsForScope, before evidence partition and component evidence.
 *
 * Owns: SIGNAL_PROVENANCE derivation, metricsEligible flag, macro/context signal partition.
 * Does NOT: scope decisions (regionSignalFilter.js), grounding tiers, or count-based evidence_basis assembly.
 *
 * Key collaborators: regionSignalFilter.js, signalDistrictId.js, ../../contracts/componentEvidence.js, openEvidenceScoringSignals.js.
 *
 * @see docs/MODEL-CARD.md (epistemic tiers)
 */

import { isRegionalReportScope } from '../../../../../cross-cut-modules/geo/reportScopeIds.js';
import { signalDistrictId } from './signalDistrictId.js';

/** Provenance labels explaining why a signal is or is not metrics-eligible. */
export const SIGNAL_PROVENANCE = Object.freeze({
  verified_geo: 'verified_geo',
  source_assigned: 'source_assigned',
  macro_national: 'macro_national',
  narrative_national_context: 'narrative_national_context',
  regional_press_context: 'regional_press_context',
  unscoped: 'unscoped',
});

/** Bare macro terms — scope hint only, never metrics for regional reports (legacy reports only). */
export const MACRO_NATIONAL_TERMS = [
  'northern israel',
  'צפון הארץ',
  'הצפון',
  'north of the country',
  'בצפון הארץ',
];

/**
 * Derive provenance from scopeDecision + geo policy (call after filterSignalsForScope).
 *
 * @param {object} signal signal with scopeDecision and optional geo
 * @returns {string} SIGNAL_PROVENANCE value
 */
export function deriveSignalProvenance(signal) {
  if (signal?.signalProvenance === SIGNAL_PROVENANCE.regional_press_context) {
    return SIGNAL_PROVENANCE.regional_press_context;
  }
  if (signal?.signalProvenance === SIGNAL_PROVENANCE.narrative_national_context
    || signal?.narrativeContextOnly === true) {
    return SIGNAL_PROVENANCE.narrative_national_context;
  }
  const scope = signal?.scopeDecision;
  if (scope?.macro_scope === 'national') return SIGNAL_PROVENANCE.macro_national;
  if (signalDistrictId(signal)) {
    return SIGNAL_PROVENANCE.source_assigned;
  }
  const g = signal?.geo;
  if (g?.kind === 'resolved') {
    const usable = g?.policy?.usableForMetrics ?? g?.usableForMetrics;
    const geoProv = g?.resolution?.provenance;
    if (
      usable !== false
      && geoProv !== 'text_inferred'
      && (scope?.source === 'geo' || scope?.source === 'geo_tags' || scope?.source === 'pbo_subregion')
    ) {
      return SIGNAL_PROVENANCE.verified_geo;
    }
  }
  if (
    scope?.isScopeRelevant
    || scope?.isNorthRelevant
    || scope?.source === 'signal_district'
    || scope?.source === 'default_north_district'
    || scope?.source === 'legacy_north_fallback'  // backward-compat for old report files
  ) {
    return SIGNAL_PROVENANCE.source_assigned;
  }
  return SIGNAL_PROVENANCE.unscoped;
}

/**
 * Whether signal may contribute to count-based component metrics (evidence_basis inputs).
 *
 * @param {object} signal
 * @param {{ reportScope?: string, epistemicGeoV2?: boolean }} [opts]
 * @returns {boolean}
 */
export function metricsEligible(signal, opts = {}) {
  const epistemicV2 = opts.epistemicGeoV2 !== false
    && process.env.RESILIENCE_EPISTEMIC_GEO_V2 !== '0';
  if (!epistemicV2) return true;

  const provenance = signal?.signalProvenance ?? deriveSignalProvenance(signal);
  if (provenance === SIGNAL_PROVENANCE.macro_national
    || provenance === SIGNAL_PROVENANCE.narrative_national_context
    || provenance === SIGNAL_PROVENANCE.regional_press_context) {
    return false;
  }

  const g = signal?.geo;
  if (g?.kind === 'resolved') {
    const usable = g?.policy?.usableForMetrics ?? g?.usableForMetrics;
    if (usable === false) return false;
  }
  return true;
}

/**
 * Attach provenance + metricsEligible flags to signals (immutable copy).
 *
 * @param {Array<object>} signals
 * @param {{ reportScope?: string }} [opts]
 * @returns {object[]}
 */
export function annotateSignalsEpistemics(signals, opts = {}) {
  return (signals ?? []).map((s) => {
    if (!s || typeof s !== 'object') return s;
    const signalProvenance = deriveSignalProvenance(s);
    const eligible = metricsEligible({ ...s, signalProvenance }, opts);
    return {
      ...s,
      signalProvenance,
      metricsEligible: eligible,
    };
  });
}

/**
 * Split macro/context-only signals from metrics-eligible signals for regional report scopes.
 *
 * @param {Array<object>} signals
 * @param {string} reportScope
 * @returns {{ metricsSignals: object[], macroSignals: object[] }}
 */
export function partitionMacroSignals(signals, reportScope = 'national') {
  if (!isRegionalReportScope(reportScope)) {
    return { metricsSignals: signals ?? [], macroSignals: [] };
  }
  const metricsSignals = [];
  const macroSignals = [];
  for (const s of signals ?? []) {
    const p = s?.signalProvenance ?? deriveSignalProvenance(s);
    if (p === SIGNAL_PROVENANCE.macro_national) {
      macroSignals.push(s);
    } else if (s?.metricsEligible === false) {
      macroSignals.push(s);
    } else {
      metricsSignals.push(s);
    }
  }
  return { metricsSignals, macroSignals };
}

/**
 * Whether epistemic geo v2 policy is enabled (env RESILIENCE_EPISTEMIC_GEO_V2).
 *
 * @returns {boolean}
 */
export function isEpistemicGeoV2Enabled() {
  return process.env.RESILIENCE_EPISTEMIC_GEO_V2 !== '0';
}
