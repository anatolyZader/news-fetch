/**
 * Shared scoring pipeline: partition → score → gate → EWMA → epistemic enrichment.
 */

import { scoreComponents } from '../domain/services/behaviorSignals.js';
import { applyEpistemicGate } from '../domain/services/dataVoid/epistemicGate.js';
import {
  resolveScoringPartition,
  summarizeQuarantinedSignals,
} from '../domain/services/dataVoid/scoringPartition.js';
import { buildQuarantineState } from '../domain/services/dataVoid/digitalQuarantineState.js';
import {
  enrichWithDeltaChannel,
  enrichScoredComponentsEpistemic,
  isEwmaFreezeOnEpistemicEnabled,
} from '../app/assessSignalsHelpers.js';

/**
 * @param {object} params
 * @param {Array<object>} params.signalsForScoring
 * @param {object} params.dataVoid
 * @param {number} params.totalArticles
 * @param {Array<object>} [params.mediaSignals]
 * @param {object} [params.salienceContext]
 * @param {Record<string, number[]>} [params.historicalScores]
 * @param {string} [params.scopeId]
 * @param {object|null} [params.validationMaturity]
 * @param {object|null} [params.priorQuarantine]
 * @param {string} [params.reportDate]
 */
export function runScoringPipeline({
  signalsForScoring,
  dataVoid,
  totalArticles,
  mediaSignals = null,
  salienceContext = {},
  historicalScores = {},
  scopeId = 'national',
  validationMaturity = null,
  priorQuarantine = null,
  reportDate = null,
}) {
  const partition = resolveScoringPartition(signalsForScoring, dataVoid, { priorQuarantine });
  const quarantinedDigital = summarizeQuarantinedSignals(
    partition.quarantinedSignals,
    partition.quarantineReason,
  );

  let digitalInclusiveScored = null;
  if (partition.quarantinedSignals.length > 0) {
    digitalInclusiveScored = scoreComponents(signalsForScoring, {
      totalArticles,
      mediaSignals,
      salienceContext,
    });
  }

  const scoringSignals = partition.scoringSignals;
  const scoringArticleCount = partition.assessmentMode === 'field_anchor_only'
    ? Math.max(scoringSignals.length, 1)
    : totalArticles;

  const fieldAnchorContext = partition.assessmentMode === 'field_anchor_only'
    ? { ...salienceContext, fieldAnchorOnly: true }
    : salienceContext;

  let scoredFull = scoreComponents(scoringSignals, {
    totalArticles: scoringArticleCount,
    mediaSignals,
    salienceContext: fieldAnchorContext,
  });

  const gateResult = applyEpistemicGate({
    scoredFull,
    signalsForScoring: scoringSignals,
    dataVoid,
    totalArticles: scoringArticleCount,
    mediaSignals,
    salienceContext,
    digitalInclusiveScored,
    scoringPartition: partition,
    quarantinedDigital,
  });

  scoredFull = gateResult.scoredFull;

  const freezeTemporal = isEwmaFreezeOnEpistemicEnabled()
    && gateResult.assessmentMode !== 'normal';
  scoredFull = enrichWithDeltaChannel(scoredFull, historicalScores, {
    scopeId,
    freezeTemporal,
  });

  const epistemicEnrichment = enrichScoredComponentsEpistemic(
    scoredFull,
    scoringSignals,
    {
      totalArticles: scoringArticleCount,
      mediaSignals,
      salienceContext: gateResult.salienceContext,
    },
    validationMaturity,
  );

  return {
    scoredFull: epistemicEnrichment.scored,
    scoringSignals,
    partition,
    quarantinedDigital: gateResult.quarantinedDigital,
    assessmentMode: gateResult.assessmentMode,
    epistemicStatus: gateResult.epistemicStatus,
    staleDigitalScores: gateResult.staleDigitalScores,
    salienceContext: gateResult.salienceContext,
    epistemicEnrichment,
    digitalInclusiveScored,
    digitalQuarantineState: buildQuarantineState(partition, dataVoid, {
      scopeId,
      reportDate: reportDate ?? new Date().toISOString().slice(0, 10),
    }),
  };
}
