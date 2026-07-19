/**
 * Shared evidence pipeline: partition → evidence contract → gate.
 *
 * Count-based successor to the scoring pipeline (partition → score → gate →
 * EWMA → epistemic enrichment). Return keys are kept compatible with the old
 * runScoringPipeline so downstream orchestration is untouched: `scoredFull`
 * now holds evidence components (score fields null), and the temporal/
 * calibration channels are gone.
 */

import { buildComponentEvidence } from '../../domain/contracts/componentEvidence.js';
import { applyEpistemicGate } from '../../domain/services/dataVoid/epistemicGate.js';
import {
  resolveScoringPartition,
  summarizeQuarantinedSignals,
} from '../../domain/services/dataVoid/scoringPartition.js';
import { buildQuarantineState } from '../../domain/services/dataVoid/digitalQuarantineState.js';

const SUFFICIENCY_CONFIDENCE = {
  none: 'insufficient_data',
  thin: 'low',
  moderate: 'medium',
  adequate: 'high',
};

/**
 * Legacy-shaped component from one evidence entry. Downstream readers branch
 * on these keys with `?? null` fallbacks; numeric score channels stay null.
 * @param {object} ev componentEvidence entry
 */
export function evidenceComponentAdapter(ev) {
  const basis = ev.evidence_basis;
  const presence = ev.critical_flags.presence_gate;
  const salient = ev.critical_flags.salient_single_signal;
  return {
    score: null,
    score_raw: null,
    score_headline: null,
    confidence: SUFFICIENCY_CONFIDENCE[basis.sufficiency] ?? 'insufficient_data',
    signal_count: basis.signal_count,
    distinct_article_count: basis.distinct_articles,
    source_diversity: basis.distinct_sources,
    evidence_basis: basis,
    critical_flags: ev.critical_flags,
    signals: ev.signals,
    presence_gate_triggered: presence != null,
    presence_gate: presence
      ? { rule_id: presence.rule_id, signal_type: presence.signal_type }
      : null,
    operator_status: presence != null ? 'critical_failure' : null,
    salience_critical: salient != null,
    salience_bypass_reasons: [],
    salience_dominant_signal_type: salient?.signal_type ?? null,
    sampling_status: ev.sampling_status,
  };
}

function buildEvidenceComponents(signals, samplingStatus) {
  const { by_component } = buildComponentEvidence(signals, { samplingStatus });
  const out = {};
  for (const [id, ev] of Object.entries(by_component)) {
    out[id] = evidenceComponentAdapter(ev);
  }
  return out;
}

/**
 * @param {object} params — same surface as the old runScoringPipeline; the
 *   temporal/calibration params (`historicalScores`, `validationMaturity`,
 *   `totalArticles`, `mediaSignals`) are accepted and ignored.
 */
export function runEvidencePipeline({
  signalsForScoring,
  dataVoid,
  totalArticles: _totalArticles,
  mediaSignals: _mediaSignals = null,
  salienceContext = {},
  historicalScores: _historicalScores = {},
  scopeId = 'national',
  validationMaturity: _validationMaturity = null,
  priorQuarantine = null,
  reportDate = null,
}) {
  const partition = resolveScoringPartition(signalsForScoring, dataVoid, { priorQuarantine });
  const quarantinedDigital = summarizeQuarantinedSignals(
    partition.quarantinedSignals,
    partition.quarantineReason,
  );

  const scoringSignals = partition.scoringSignals;
  const samplingStatus = partition.assessmentMode === 'field_anchor_only'
    ? 'field_anchor_only'
    : 'normal';

  const scoredInitial = buildEvidenceComponents(scoringSignals, samplingStatus);

  const gateResult = applyEpistemicGate({
    scoredFull: scoredInitial,
    signalsForScoring: scoringSignals,
    dataVoid,
    totalArticles: scoringSignals.length,
    salienceContext,
    digitalInclusiveScored: null,
    scoringPartition: partition,
    quarantinedDigital,
    scoreComponents: (signals) => buildEvidenceComponents(signals, 'field_anchor_only'),
  });

  const scoredFull = gateResult.scoredFull;

  return {
    scoredFull,
    scoringSignals,
    partition,
    quarantinedDigital: gateResult.quarantinedDigital,
    assessmentMode: gateResult.assessmentMode,
    epistemicStatus: gateResult.epistemicStatus,
    staleDigitalScores: null,
    salienceContext: gateResult.salienceContext,
    epistemicEnrichment: { scored: scoredFull },
    digitalInclusiveScored: null,
    digitalQuarantineState: buildQuarantineState(partition, dataVoid, {
      scopeId,
      reportDate: reportDate ?? new Date().toISOString().slice(0, 10),
    }),
  };
}

/** Back-compat alias so call sites can migrate incrementally. */
export const runScoringPipeline = runEvidencePipeline;
