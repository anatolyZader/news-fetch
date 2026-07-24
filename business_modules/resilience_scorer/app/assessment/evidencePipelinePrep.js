/**
 * Shared count-based evidence pipeline: partition → component evidence → epistemic gate.
 *
 * **Owns:** transformation of scoped signals into per-component evidence records and gate
 * enrichment (presence, salience, quarantine state). Successor to the legacy scoring pipeline.
 *
 * **Pipeline position:** inside Stage-2 assessment, after `prepareScoringSignals`, before
 * narrate/agent paths consume `scoredFull`.
 *
 * **Inputs:** metrics-eligible signals, data-void context, salience context, optional prior
 * quarantine, report date/scope.
 *
 * **Outputs:** `{ scoredFull, scoringSignals, partition, epistemicStatus, digitalQuarantineState, … }`
 * with legacy-compatible keys (`scoredFull` holds evidence components; numeric score fields null).
 *
 * **Does NOT:** call LLMs, write reports, or compute numeric resilience scores / EWMA / calibration.
 *
 * **Collaborators:** `domain/contracts/componentEvidence`, `domain/services/dataVoid/*`,
 * `domain/epistemic` (via epistemic gate).
 *
 * Return keys are kept compatible with the old runScoringPipeline so downstream orchestration
 * is untouched: temporal/calibration params are accepted and ignored.
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

/** One-step confidence downgrade (floor at 'low'; insufficient stays as is). */
const CONFIDENCE_DOWNGRADE = {
  high: 'medium',
  medium: 'low',
  low: 'low',
  insufficient_data: 'insufficient_data',
};

/**
 * A component where a single outlet/source-type holds ≥90% of the signals is
 * effectively single-sourced regardless of raw volume — volume-driven
 * "adequate → high" must not survive that (e.g. wellbeing at 96% field visits).
 */
const EXTREME_CONCENTRATION_SHARE = 0.9;

/** Sufficiency-derived confidence, downgraded one step under extreme concentration. */
function deriveConfidence(basis) {
  const base = SUFFICIENCY_CONFIDENCE[basis.sufficiency] ?? 'insufficient_data';
  const cw = basis.concentration_warning;
  if (cw && cw.share >= EXTREME_CONCENTRATION_SHARE) {
    return {
      confidence: CONFIDENCE_DOWNGRADE[base],
      confidence_caveat: `downgraded: ${cw.layer.replaceAll('_', ' ')} "${cw.key}" holds ${Math.round(cw.share * 100)}% of signals`,
    };
  }
  return { confidence: base, confidence_caveat: null };
}

/**
 * Map one `buildComponentEvidence` entry to legacy-shaped component object for downstream readers.
 *
 * @param {object} ev — componentEvidence entry from `buildComponentEvidence`
 * @returns {object} legacy component row (`score`/`score_raw`/`score_headline` always null)
 */
export function evidenceComponentAdapter(ev) {
  const basis = ev.evidence_basis;
  const presence = ev.critical_flags.presence_gate;
  const salient = ev.critical_flags.salient_single_signal;
  const { confidence, confidence_caveat } = deriveConfidence(basis);
  return {
    score: null,
    score_raw: null,
    score_headline: null,
    confidence,
    confidence_caveat,
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
    operator_status: presence ? 'critical_failure' : null,
    salience_critical: salient != null,
    salience_bypass_reasons: [],
    salience_dominant_signal_type: salient?.signal_type ?? null,
    sampling_status: ev.sampling_status,
  };
}

/** Build per-component evidence map via `buildComponentEvidence` + adapter. */
function buildEvidenceComponents(signals, samplingStatus) {
  const { by_component } = buildComponentEvidence(signals, { samplingStatus });
  const out = {};
  for (const [id, ev] of Object.entries(by_component)) {
    out[id] = evidenceComponentAdapter(ev);
  }
  return out;
}

/**
 * Run partition → evidence components → epistemic gate (count-based assessment prep).
 *
 * @param {object} params — same surface as legacy `runScoringPipeline`
 * @param {object[]} params.signalsForScoring
 * @param {object} params.dataVoid
 * @param {object} [params.salienceContext={}]
 * @param {string} [params.scopeId='national']
 * @param {object|null} [params.priorQuarantine=null]
 * @param {string|null} [params.reportDate=null]
 * @returns {object} gate result with `scoredFull`, partition, quarantine, epistemic status
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
    digitalInclusiveScored: null,
    salienceContext: gateResult.salienceContext,
    epistemicEnrichment: { scored: scoredFull },
    digitalQuarantineState: buildQuarantineState(partition, dataVoid, {
      scopeId,
      reportDate: reportDate ?? new Date().toISOString().slice(0, 10),
    }),
  };
}

/** Back-compat alias so call sites can migrate incrementally from `runScoringPipeline`. */
export const runScoringPipeline = runEvidencePipeline;
