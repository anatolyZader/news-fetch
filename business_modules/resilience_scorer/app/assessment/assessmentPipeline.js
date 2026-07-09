/**
 * Shared scope filtering and epistemic partitioning for server and CLI assessment paths.
 */
import { isRegionalReportScope } from '../../../../cross-cut-modules/geo/reportScopeIds.js';
import { createDefaultReportScopePolicy } from '../../infrastructure/adapters/defaultReportScopePolicyAdapter.js';

const defaultScopePolicy = createDefaultReportScopePolicy();
import {
  annotateSignalsEpistemics,
  partitionMacroSignals,
} from '../../domain/services/signals/evidenceEligibility.js';
import {
  annotateScopeDecisions,
  buildNarrativeScopeSignals,
  scopedSignalKeys,
  selectNarrativeNationalContext,
  selectRegionalPressContext,
  signalDedupeKey,
} from '../../domain/services/narrative/narrativeScopeSignals.js';
import { shouldDropNonResilienceCasualtySignal } from '../../domain/services/signals/signalTypeHygiene.js';

/**
 * Remove crime / EMS aggregate casualty noise before scope partition and scoring.
 * @param {object[]} signals
 * @returns {object[]}
 */
export function filterCasualtyNoiseFromAnalysisSignals(signals) {
  return (signals ?? []).filter((s) => !shouldDropNonResilienceCasualtySignal(s));
}

/**
 * Apply report scope, epistemic annotations, and metrics/macro partition.
 *
 * @param {object[]} allSignals
 * @param {string} reportScopeId
 * @returns {{
 *   scopedSignals: object[],
 *   metricsSignals: object[],
 *   macroSignals: object[],
 *   baseSignalsForScoring: object[],
 *   narrativeNationalContext: object[],
 *   regionalPressContext: object[],
 *   narrativeScopeSignals: object[],
 * }}
 */
/**
 * @param {object[]} allSignals
 * @param {string} reportScopeId
 * @param {import('../domain/ports/IReportScopePolicy.js').IReportScopePolicy} [scopePolicy]
 */
export function scopeAndPartitionSignals(allSignals, reportScopeId, scopePolicy = defaultScopePolicy) {
  const cleaned = filterCasualtyNoiseFromAnalysisSignals(allSignals);
  const annotated = annotateScopeDecisions(cleaned, reportScopeId);
  let scopedSignals = scopePolicy.filterSignalsForScope(annotated, reportScopeId);
  scopedSignals = annotateSignalsEpistemics(scopedSignals, { reportScope: reportScopeId });
  const { metricsSignals, macroSignals } = partitionMacroSignals(scopedSignals, reportScopeId);
  const baseSignalsForScoring = isRegionalReportScope(reportScopeId)
    ? metricsSignals
    : scopedSignals;

  const keys = scopedSignalKeys(scopedSignals);
  const regionalPressContext = selectRegionalPressContext(
    annotated,
    reportScopeId,
    keys,
  );
  const contextKeys = new Set([
    ...keys,
    ...regionalPressContext.map((s) => signalDedupeKey(s)),
  ]);
  const narrativeNationalContext = selectNarrativeNationalContext(
    annotated,
    reportScopeId,
    contextKeys,
  );
  const narrativeScopeSignals = buildNarrativeScopeSignals({
    scopedSignals,
    narrativeNationalContext,
    regionalPressContext,
  });

  return {
    scopedSignals,
    metricsSignals,
    macroSignals,
    baseSignalsForScoring,
    narrativeNationalContext,
    regionalPressContext,
    narrativeScopeSignals,
  };
}
