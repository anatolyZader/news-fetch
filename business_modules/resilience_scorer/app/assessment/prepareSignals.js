/**
 * Shared pre-assessment preparation: OSINT quarantine, gaming policy, data void, OOV burst.
 * prepareInvestigationSignals feeds the investigation surface (no synthetic signals);
 * prepareScoringSignals additionally synthesizes OOV scoring signals.
 */

import { computeDataVoidIndex } from '../../domain/services/dataVoid/computeDataVoidIndex.js';
import { loadActiveQuarantine } from '../../domain/services/dataVoid/digitalQuarantineState.js';
import { evaluateOovBurst } from '../../domain/services/oov/oovBurstAlert.js';
import { synthesizeOovScoringSignals } from '../../domain/services/oov/oovScoringSignals.js';
import {
  applyOsintQuarantineFilter,
  evaluateOsintChannelQuarantine,
} from '../../domain/services/dataVoid/socialChannelQuarantine.js';
import { applySignalGamingPolicy } from '../../domain/services/signals/signalGamingPolicy.js';
import { resilienceReportsDir, resilienceCapturesDir } from '../../domain/services/paths/outputDirs.js';
import { loadHistoricalSignalDays } from '../../infrastructure/reportHistoryReader.js';

async function prepareSignalsBase({
  signals,
  reportDate,
  reportScopeId,
  reportsDir,
  digitalDarknessHint,
  allSignalsForDiagnostics = null,
}) {
  // Developer confirm/dismiss overrides were decommissioned along with developer/validation —
  // social-channel quarantine now runs on auto-detection only.
  const osintChannelQuarantine = evaluateOsintChannelQuarantine(signals, {
    active: false,
    dismissed: false,
  });

  let prepared = applyOsintQuarantineFilter(signals, osintChannelQuarantine);
  prepared = applySignalGamingPolicy(prepared);

  const historicalSignalDays = loadHistoricalSignalDays(
    reportDate,
    reportsDir,
    7,
    reportScopeId,
  );

  const dataVoid = computeDataVoidIndex(prepared, historicalSignalDays, {
    reportScope: reportScopeId,
    ...(allSignalsForDiagnostics ? { allSignalsForDiagnostics } : {}),
  });

  const priorQuarantine = loadActiveQuarantine(reportDate, reportScopeId, reportsDir);

  const oovBurst = await evaluateOovBurst(reportDate, {
    capturesDir: resilienceCapturesDir(),
    digitalDarkness: digitalDarknessHint || dataVoid?.digital_darkness === true,
  });

  return { prepared, dataVoid, osintChannelQuarantine, oovBurst, priorQuarantine };
}

/**
 * @param {object} params
 * @param {Array<object>} params.investigationSignals — metrics-eligible scoped signals
 * @param {string} params.reportDate
 * @param {string} params.reportScopeId
 * @param {string} [params.reportsDir]
 * @param {boolean} [params.digitalDarknessHint]
 * @param {Array<object>} [params.allSignalsForDiagnostics]
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
  reportsDir = resilienceReportsDir(),
  digitalDarknessHint = false,
  allSignalsForDiagnostics = null,
}) {
  const { prepared, ...rest } = await prepareSignalsBase({
    signals: investigationSignals,
    reportDate,
    reportScopeId,
    reportsDir,
    digitalDarknessHint,
    allSignalsForDiagnostics,
  });
  return { investigationSignals: prepared, ...rest };
}

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
  reportsDir = resilienceReportsDir(),
  digitalDarknessHint = false,
}) {
  const { prepared, ...rest } = await prepareSignalsBase({
    signals: signalsForScoring,
    reportDate,
    reportScopeId,
    reportsDir,
    digitalDarknessHint,
  });

  const { signals: oovSignals, applied: oovScoringApplied } = synthesizeOovScoringSignals(rest.oovBurst, {
    reportDate,
    reportScopeId,
  });

  const signalsOut = oovSignals.length > 0 ? [...prepared, ...oovSignals] : prepared;

  return { signalsForScoring: signalsOut, ...rest, oovScoringApplied };
}
