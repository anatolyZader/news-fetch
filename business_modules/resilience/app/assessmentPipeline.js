/**
 * Shared scope filtering and epistemic partitioning for server and CLI assessment paths.
 */
import { isRegionalReportScope } from '../../../cross-cut-modules/geo/reportScopeIds.js';
import { createDefaultReportScopePolicy } from '../infrastructure/adapters/defaultReportScopePolicyAdapter.js';

const defaultScopePolicy = createDefaultReportScopePolicy();
import {
  annotateSignalsEpistemics,
  partitionMacroSignals,
} from '../domain/services/evidenceEligibility.js';
import {
  buildNarrativeScopeSignals,
  scopedSignalKeys,
  selectNarrativeNationalContext,
} from '../domain/services/narrativeScopeSignals.js';

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
 *   narrativeScopeSignals: object[],
 * }}
 */
/**
 * @param {object[]} allSignals
 * @param {string} reportScopeId
 * @param {import('../domain/ports/IReportScopePolicy.js').IReportScopePolicy} [scopePolicy]
 */
export function scopeAndPartitionSignals(allSignals, reportScopeId, scopePolicy = defaultScopePolicy) {
  let scopedSignals = scopePolicy.filterSignalsForScope(allSignals, reportScopeId);
  scopedSignals = annotateSignalsEpistemics(scopedSignals, { reportScope: reportScopeId });
  const { metricsSignals, macroSignals } = partitionMacroSignals(scopedSignals, reportScopeId);
  const baseSignalsForScoring = isRegionalReportScope(reportScopeId)
    ? metricsSignals
    : scopedSignals;

  const keys = scopedSignalKeys(scopedSignals);
  const narrativeNationalContext = selectNarrativeNationalContext(
    allSignals,
    reportScopeId,
    keys,
  );
  const narrativeScopeSignals = buildNarrativeScopeSignals({
    scopedSignals,
    narrativeNationalContext,
  });

  return {
    scopedSignals,
    metricsSignals,
    macroSignals,
    baseSignalsForScoring,
    narrativeNationalContext,
    narrativeScopeSignals,
  };
}
