/**
 * Epistemic gate — abstention and field-anchor-only scoring modes.
 */

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
 * Apply epistemic gate to scoring results based on data void outcome.
 *
 * @param {object} params
 * @param {Record<string, object>} params.scoredFull
 * @param {Array<object>} params.signalsForScoring
 * @param {object} params.dataVoid
 * @param {number} params.totalArticles
 * @param {Array<object>} [params.mediaSignals]
 * @param {object} [params.salienceContext]
 * @param {object|null} [params.scoringPartition] from resolveScoringPartition
 * @param {object|null} [params.quarantinedDigital] summarizeQuarantinedSignals output
 * @returns {{
 *   scoredFull: Record<string, object>,
 *   assessmentMode: string,
 *   epistemicStatus: object,
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
  scoringPartition = null,
  quarantinedDigital = null,
  scoreComponents = null,
}) {
  const voidLevel = dataVoid?.level ?? 'none';
  const salienceCtx = {
    ...salienceContext,
    dataVoidLevel: voidLevel,
    digitalDarkness: dataVoid?.digital_darkness === true,
  };

  const partitionApplied = scoringPartition?.partitionApplied === true;

  if (partitionApplied && scoringPartition.assessmentMode === 'field_anchor_only') {
    const epistemicStatus = buildEpistemicStatus(dataVoid, {
      assessmentMode: 'field_anchor_only',
    });

    return {
      scoredFull,
      assessmentMode: 'field_anchor_only',
      epistemicStatus,
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
      salienceContext: { ...salienceCtx, voidAbstention: true },
      quarantinedDigital: null,
    };
  }

  if (!partitionApplied && dataVoid?.digital_darkness === true) {
    if (typeof scoreComponents !== 'function') {
      throw new Error('applyEpistemicGate requires scoreComponents for field_anchor_only under digital_darkness');
    }
    const fieldSignals = filterAnchorSignals(signalsForScoring);
    const fieldScored = scoreComponents(fieldSignals, {
      totalArticles: Math.max(fieldSignals.length, 1),
      mediaSignals,
      salienceContext: { ...salienceCtx, fieldAnchorOnly: true },
    });

    const epistemicStatus = buildEpistemicStatus(dataVoid, {
      assessmentMode: 'field_anchor_only',
    });

    return {
      scoredFull: fieldScored,
      assessmentMode: 'field_anchor_only',
      epistemicStatus,
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
  quarantinedDigital,
  digitalQuarantineState,
}) {
  if (!assessment || typeof assessment !== 'object') return assessment;
  assessment.data_void = dataVoid;
  assessment.epistemic_status = epistemicStatus;
  assessment.assessment_mode = assessmentMode;
  if (quarantinedDigital && quarantinedDigital.count > 0) {
    assessment.quarantined_digital = quarantinedDigital;
  }
  if (digitalQuarantineState?.active === true) {
    assessment.digital_quarantine_state = digitalQuarantineState;
  }
  return assessment;
}
