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

/**
 * Share of a component's primary evidence coming from municipalities whose PBO
 * report was reviewed and found to be missing evidence, above which the
 * volume-derived sufficiency band overstates what we actually know.
 *
 * Lower than EXTREME_CONCENTRATION_SHARE on purpose: concentration is a *proxy*
 * for lost independence and must be near-total before it is acted on, whereas a
 * review verdict is a direct quality judgement on the evidence itself, so a
 * simple majority earns the downgrade. First cut — revisit once re-extraction
 * produces a real distribution.
 */
const THIN_REVIEW_SHARE = 0.5;

/**
 * Share of a component's primary evidence that is the assessed body reporting
 * on itself, above which the volume band overstates what is actually known.
 *
 * Only fires on components where the PBO author IS the assessed object
 * (leadership, information_communication — see sourceIndependence.js). The
 * municipality asserting that its own leadership is trusted is not the same
 * evidence as an outside observer saying so, however many municipalities say it.
 */
const SELF_ASSESSED_SHARE = 0.8;

/**
 * Share of independent-class evidence below which a component has essentially
 * no outside corroboration. Deliberately behind a switch and OFF by default:
 * on the current corpus PBO + visits dominate nearly every component, so
 * enabling it blind would downgrade most of a report at once. The measurement
 * ships now (source_class_exposure is always reported); acting on it waits for
 * an epoch where the distribution has been looked at.
 */
const NO_INDEPENDENT_CORROBORATION_SHARE = 0.05;

function independenceDowngradeEnabled(env = process.env) {
  return env.RESILIENCE_INDEPENDENCE_DOWNGRADE === '1';
}

/** Human-readable reasons the sufficiency-derived band overstates confidence. */
function confidenceDowngradeReasons(basis) {
  const reasons = [];
  const cw = basis.concentration_warning;
  if (cw && cw.share >= EXTREME_CONCENTRATION_SHARE) {
    reasons.push(`${cw.layer.replaceAll('_', ' ')} "${cw.key}" holds ${Math.round(cw.share * 100)}% of signals`);
  }
  const rc = basis.review_completeness;
  if (rc && typeof rc.incomplete_share === 'number' && rc.incomplete_share >= THIN_REVIEW_SHARE) {
    reasons.push(`${Math.round(rc.incomplete_share * 100)}% of evidence from PBO reports reviewed as incomplete`);
  }
  const sce = basis.source_class_exposure;
  if (sce) {
    // else-if: both arms name the same validity deficit, and the caveat should
    // not say it twice.
    if (sce.self_assessed && sce.self_reported_share >= SELF_ASSESSED_SHARE) {
      reasons.push(`${Math.round(sce.self_reported_share * 100)}% of evidence is the assessed body reporting on itself`);
    } else if (independenceDowngradeEnabled() && sce.independent_share <= NO_INDEPENDENT_CORROBORATION_SHARE) {
      reasons.push(`only ${Math.round(sce.independent_share * 100)}% of evidence comes from an independent source class`);
    }
  }
  return reasons;
}

/**
 * Sufficiency-derived confidence, downgraded one step when evidence quality
 * undercuts the volume band.
 *
 * Downgrades do NOT stack: CONFIDENCE_DOWNGRADE is a one-step map, so applying
 * it twice takes high straight to low, skipping medium — and 'low' is not a
 * neutral value, since userDisplayState routes it to
 * assessed_low_confidence. On PBO-dominated components both reasons routinely
 * fire together, so stacking would be the common case, not the corner case.
 * Every reason still appears in the caveat; only the band effect is capped.
 */
function deriveConfidence(basis) {
  const base = SUFFICIENCY_CONFIDENCE[basis.sufficiency] ?? 'insufficient_data';
  const reasons = confidenceDowngradeReasons(basis);
  if (reasons.length === 0) return { confidence: base, confidence_caveat: null };
  return {
    confidence: CONFIDENCE_DOWNGRADE[base],
    confidence_caveat: `downgraded: ${reasons.join('; ')}`,
  };
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
    user_status: presence ? 'critical_failure' : null,
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
