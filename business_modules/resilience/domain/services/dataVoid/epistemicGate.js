/**
 * Epistemic gate — abstention and field-anchor-only scoring modes.
 */

import { scoreComponents } from '../behaviorSignals.js';
import { filterAnchorSignals } from './sourceChannels.js';
import { buildEpistemicStatus } from './epistemicStatus.js';

const ELEVATED_OR_ABOVE = new Set(['elevated', 'critical']);

/**
 * Null out headline scores while preserving analyst raw fields.
 * @param {Record<string, object>} scored
 * @returns {Record<string, object>}
 */
export function applyScoreAbstention(scored) {
  const out = {};
  for (const [id, comp] of Object.entries(scored ?? {})) {
    if (!comp || typeof comp !== 'object') {
      out[id] = comp;
      continue;
    }
    out[id] = {
      ...comp,
      score_abstained: comp.score,
      score: null,
      score_smoothed: null,
      score_low: null,
      score_high: null,
      ci_epistemic_invalid: true,
      ci_unstable: false,
      confidence: 'insufficient_data',
      epistemic_abstention: true,
    };
  }
  return out;
}

/**
 * @param {Record<string, object>} scored
 * @param {string} [reason]
 * @returns {object|null}
 */
export function snapshotScoresForStale(scored, reason = 'digital_darkness') {
  if (!scored || typeof scored !== 'object') return null;
  /** @type {Record<string, { score: number|null, confidence: string|null }>} */
  const components = {};
  for (const [id, comp] of Object.entries(scored)) {
    components[id] = {
      score: comp?.score ?? null,
      confidence: comp?.confidence ?? null,
    };
  }
  return {
    scored_at: new Date().toISOString(),
    components,
    reason,
  };
}

/**
 * Apply epistemic gate to scoring results based on data void outcome.
 *
 * @param {object} params
 * @param {Record<string, object>} params.scoredFull
 * @param {Array<object>} params.signalsForScoring
 * @param {object} params.dataVoid
 * @param {number} params.totalArticles
 * @param {Array<object>} [params.mediaSignals]
 * @param {object} [params.salienceContext]
 * @param {Record<string, object>} [params.digitalInclusiveScored] pre-gate full score for stale reference
 * @param {object|null} [params.scoringPartition] from resolveScoringPartition
 * @param {object|null} [params.quarantinedDigital] summarizeQuarantinedSignals output
 * @returns {{
 *   scoredFull: Record<string, object>,
 *   assessmentMode: string,
 *   epistemicStatus: object,
 *   staleDigitalScores: object|null,
 *   salienceContext: object,
 *   quarantinedDigital: object|null,
 * }}
 */
export function applyEpistemicGate({
  scoredFull,
  signalsForScoring,
  dataVoid,
  totalArticles: _totalArticles,
  mediaSignals = null,
  salienceContext = {},
  digitalInclusiveScored = null,
  scoringPartition = null,
  quarantinedDigital = null,
}) {
  const voidLevel = dataVoid?.level ?? 'none';
  const salienceCtx = {
    ...salienceContext,
    dataVoidLevel: voidLevel,
    digitalDarkness: dataVoid?.digital_darkness === true,
  };

  const partitionApplied = scoringPartition?.partitionApplied === true;

  if (partitionApplied && scoringPartition.assessmentMode === 'field_anchor_only') {
    const staleReason = scoringPartition.quarantineReason ?? 'digital_darkness';
    const staleDigitalScores = digitalInclusiveScored
      ? snapshotScoresForStale(digitalInclusiveScored, staleReason)
      : null;

    const epistemicStatus = buildEpistemicStatus(dataVoid, {
      assessmentMode: 'field_anchor_only',
    });

    return {
      scoredFull,
      assessmentMode: 'field_anchor_only',
      epistemicStatus,
      staleDigitalScores,
      salienceContext: { ...salienceCtx, fieldAnchorOnly: true },
      quarantinedDigital,
    };
  }

  if (partitionApplied && scoringPartition.assessmentMode === 'abstained') {
    const abstained = applyScoreAbstention(scoredFull);
    const epistemicStatus = buildEpistemicStatus(dataVoid, {
      assessmentMode: 'abstained',
    });

    return {
      scoredFull: abstained,
      assessmentMode: 'abstained',
      epistemicStatus,
      staleDigitalScores: null,
      salienceContext: { ...salienceCtx, voidAbstention: true },
      quarantinedDigital: null,
    };
  }

  if (!partitionApplied && dataVoid?.digital_darkness === true) {
    const fieldSignals = filterAnchorSignals(signalsForScoring);
    const fieldScored = scoreComponents(fieldSignals, {
      totalArticles: Math.max(fieldSignals.length, 1),
      mediaSignals,
      salienceContext: { ...salienceCtx, fieldAnchorOnly: true },
    });

    const staleDigitalScores = snapshotScoresForStale(
      digitalInclusiveScored ?? scoredFull,
      'digital_darkness',
    );

    const epistemicStatus = buildEpistemicStatus(dataVoid, {
      assessmentMode: 'field_anchor_only',
    });

    return {
      scoredFull: fieldScored,
      assessmentMode: 'field_anchor_only',
      epistemicStatus,
      staleDigitalScores,
      salienceContext: salienceCtx,
      quarantinedDigital,
    };
  }

  if (!partitionApplied && ELEVATED_OR_ABOVE.has(voidLevel)) {
    const abstained = applyScoreAbstention(scoredFull);
    const epistemicStatus = buildEpistemicStatus(dataVoid, {
      assessmentMode: 'abstained',
    });

    return {
      scoredFull: abstained,
      assessmentMode: 'abstained',
      epistemicStatus,
      staleDigitalScores: null,
      salienceContext: { ...salienceCtx, voidAbstention: true },
      quarantinedDigital: null,
    };
  }

  const epistemicStatus = buildEpistemicStatus(dataVoid, {
    assessmentMode: 'normal',
  });

  return {
    scoredFull,
    assessmentMode: 'normal',
    epistemicStatus,
    staleDigitalScores: null,
    salienceContext: salienceCtx,
    quarantinedDigital: null,
  };
}

/**
 * Attach epistemic fields to assessment object.
 * @param {object} assessment
 * @param {object} params
 */
export function attachEpistemicToAssessment(assessment, {
  dataVoid,
  epistemicStatus,
  assessmentMode,
  staleDigitalScores,
  quarantinedDigital,
  digitalQuarantineState,
}) {
  if (!assessment || typeof assessment !== 'object') return assessment;
  assessment.data_void = dataVoid;
  assessment.epistemic_status = epistemicStatus;
  assessment.assessment_mode = assessmentMode;
  if (staleDigitalScores) {
    assessment.stale_digital_scores = staleDigitalScores;
  }
  if (quarantinedDigital && quarantinedDigital.count > 0) {
    assessment.quarantined_digital = quarantinedDigital;
  }
  if (digitalQuarantineState?.active === true) {
    assessment.digital_quarantine_state = digitalQuarantineState;
  }
  return assessment;
}
