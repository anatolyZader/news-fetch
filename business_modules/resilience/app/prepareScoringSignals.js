/**
 * Shared pre-scoring preparation: OSINT quarantine, data void, OOV burst, synthetic signals.
 */

import { computeDataVoidIndex } from '../domain/services/dataVoid/computeDataVoidIndex.js';
import { loadActiveQuarantine } from '../domain/services/dataVoid/digitalQuarantineState.js';
import { evaluateOovBurst } from '../domain/services/oovBurstAlert.js';
import { synthesizeOovScoringSignals } from '../domain/services/oovScoringSignals.js';
import {
  applyOsintQuarantineFilter,
  evaluateOsintChannelQuarantine,
} from '../domain/services/socialChannelQuarantine.js';
import { applySignalGamingPolicy } from '../domain/services/signalGamingPolicy.js';
import {
  isSocialQuarantineActive,
  isSocialQuarantineDismissed,
} from '../domain/services/socialQuarantineOverrides.js';
import { loadHistoricalSignalDays } from '../input/assessSignalsHelpers.js';

/**
 * @param {object} params
 * @param {Array<object>} params.signalsForScoring — metrics-eligible scoped signals (post macro partition)
 * @param {string} params.reportDate
 * @param {string} params.reportScopeId
 * @param {string} [params.reportsDir]
 * @param {boolean} [params.digitalDarknessHint]
 * @returns {Promise<{
 *   signalsForScoring: Array<object>,
 *   dataVoid: object,
 *   osintChannelQuarantine: object,
 *   oovBurst: object,
 *   oovScoringApplied: object|null,
 *   priorQuarantine: object|null,
 * }>}
 */
export async function prepareScoringSignals({
  signalsForScoring,
  reportDate,
  reportScopeId,
  reportsDir = 'reports',
  digitalDarknessHint = false,
}) {
  const dismissed = isSocialQuarantineDismissed(reportDate, reportScopeId);
  const analystActive = isSocialQuarantineActive(reportDate, reportScopeId);

  let osintChannelQuarantine = evaluateOsintChannelQuarantine(signalsForScoring, {
    active: analystActive,
    dismissed,
  });

  if (analystActive && osintChannelQuarantine.suggested) {
    osintChannelQuarantine = {
      ...osintChannelQuarantine,
      active: true,
      reason: 'analyst_confirmed',
    };
  }

  let prepared = applyOsintQuarantineFilter(signalsForScoring, osintChannelQuarantine);
  prepared = applySignalGamingPolicy(prepared);

  const historicalSignalDays = loadHistoricalSignalDays(
    reportDate,
    reportsDir,
    7,
    reportScopeId,
  );

  const dataVoid = computeDataVoidIndex(prepared, historicalSignalDays, {
    reportScope: reportScopeId,
  });

  const priorQuarantine = loadActiveQuarantine(reportDate, reportScopeId, reportsDir);

  const oovBurst = await evaluateOovBurst(reportDate, {
    reportsDir,
    digitalDarkness: digitalDarknessHint || dataVoid?.digital_darkness === true,
  });

  const { signals: oovSignals, applied: oovScoringApplied } = synthesizeOovScoringSignals(oovBurst, {
    reportDate,
    reportScopeId,
  });

  if (oovSignals.length > 0) {
    prepared = [...prepared, ...oovSignals];
  }

  return {
    signalsForScoring: prepared,
    dataVoid,
    osintChannelQuarantine,
    oovBurst,
    oovScoringApplied,
    priorQuarantine,
  };
}
