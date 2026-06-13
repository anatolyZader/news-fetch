/**
 * Pre-investigation preparation: OSINT quarantine, data void, OOV burst.
 * Does not apply scoring partition or OOV scoring synthetic signals.
 */

import { computeDataVoidIndex } from '../domain/services/dataVoid/computeDataVoidIndex.js';
import { loadActiveQuarantine } from '../domain/services/dataVoid/digitalQuarantineState.js';
import { evaluateOovBurst } from '../domain/services/oovBurstAlert.js';
import {
  applyOsintQuarantineFilter,
  evaluateOsintChannelQuarantine,
} from '../domain/services/socialChannelQuarantine.js';
import { applySignalGamingPolicy } from '../domain/services/signalGamingPolicy.js';
import {
  isSocialQuarantineActive,
  isSocialQuarantineDismissed,
} from '../domain/services/socialQuarantineOverrides.js';
import { loadHistoricalSignalDays } from './assessSignalsHelpers.js';

/**
 * @param {object} params
 * @param {Array<object>} params.investigationSignals — metrics-eligible scoped signals
 * @param {string} params.reportDate
 * @param {string} params.reportScopeId
 * @param {string} [params.reportsDir]
 * @param {boolean} [params.digitalDarknessHint]
 * @returns {Promise<{
 *   investigationSignals: Array<object>,
 *   dataVoid: object,
 *   osintChannelQuarantine: object,
 *   oovBurst: object,
 *   priorQuarantine: object|null,
 * }>}
 */
export async function prepareInvestigationSignals({
  investigationSignals,
  reportDate,
  reportScopeId,
  reportsDir = 'daily_reports',
  digitalDarknessHint = false,
}) {
  const dismissed = isSocialQuarantineDismissed(reportDate, reportScopeId);
  const analystActive = isSocialQuarantineActive(reportDate, reportScopeId);

  let osintChannelQuarantine = evaluateOsintChannelQuarantine(investigationSignals, {
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

  let prepared = applyOsintQuarantineFilter(investigationSignals, osintChannelQuarantine);
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

  return {
    investigationSignals: prepared,
    dataVoid,
    osintChannelQuarantine,
    oovBurst,
    priorQuarantine,
  };
}
