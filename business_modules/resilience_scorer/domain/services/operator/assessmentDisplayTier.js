/**
 * Per-component instrument state and report-payload shaping for the single report surface.
 *
 * Pipeline position: late finalize / HTTP redact path — after specialist agent and
 * narrative grounding; before client render and chat tool payloads.
 *
 * Owns: qualitative `instrument` object (sufficiency, balance, contested flags,
 * count-based evidence fields); passthrough redact helpers that attach instrument
 * to every component. No numeric resilience scores.
 * Does NOT: compute evidence partitions, build attention items, or run LLM narrative.
 * Historical `view` params are kept for call-site compatibility only — there is no
 * separate analyst/redacted view.
 *
 * Key collaborators: `epistemic/thinEvidencePolicy.js`, `narrativeGrounding/groundingConfig.js`,
 * `contracts/displayViews.js`, `operator/attentionItems.js`, report HTTP routes.
 */

import { DISPLAY_VIEWS } from '../../contracts/displayViews.js';
import { deriveThinEvidencePolicy, isThinEvidencePolicyEnabled, deriveAssessmentEpistemicPolicy } from '../../epistemic/thinEvidencePolicy.js';
import { narrativeGroundingMinScore } from '../narrativeGrounding/groundingConfig.js';
import { isSoftVoidWarning } from '../../contracts/softVoidReasons.js';

const SUFFICIENCY_CERTAINTY_BAND = {
  none: 'low',
  thin: 'low',
  moderate: 'medium',
  adequate: 'high',
};

// ── Instrument derivation ─────────────────────────────────────────────────────

const BALANCE_POLARIZATION_BAND = {
  one_sided_pos: 'one_sided',
  one_sided_neg: 'one_sided',
  mixed: 'mixed',
  contested: 'contested',
};

/**
 * Build the qualitative instrument object a component exposes to the report UI.
 *
 * @param {object} comp Evidence component (or legacy stored component).
 * @param {object} [assessmentContext] Assessment-level void/epistemic context.
 * @param {object} [assessmentContext.dataVoid]
 * @param {object} [assessmentContext.epistemicStatus]
 * @returns {object} Count-based instrument fields (no numeric score).
 */
export function deriveInstrumentState(comp, assessmentContext = {}) {
  const basis = comp?.evidence_basis ?? null;
  const sufficiency = basis?.sufficiency
    ?? (comp?.confidence === 'insufficient_data' ? 'none' : null);
  const balance = basis?.balance ?? null;

  const assessmentEpistemic = assessmentContext.assessmentEpistemic
    ?? deriveAssessmentEpistemicPolicy(
      assessmentContext.dataVoid,
      assessmentContext.epistemicStatus,
    );

  const thinPolicy = isThinEvidencePolicyEnabled()
    ? deriveThinEvidencePolicy(comp, { assessmentEpistemic })
    : null;

  const groundingScore = comp?.narrative_grounding_score;
  const interpretiveSummary = comp?.interpretive_summary === true
    || (groundingScore != null && groundingScore < narrativeGroundingMinScore());

  const instrument = {
    confidence: comp?.confidence ?? 'insufficient_data',
    evidence_sufficiency: sufficiency ?? 'moderate',
    balance,
    contested: balance === 'contested',
    contested_thin: thinPolicy?.contested_thin ?? false,
    salience_critical: comp?.salience_critical === true,
    presence_gate_triggered: comp?.presence_gate_triggered === true,
    operator_status: comp?.operator_status ?? null,
    contested_evidence: balance === 'contested',
    signal_count: comp?.signal_count ?? 0,
    distinct_article_count: comp?.distinct_article_count ?? 0,
    positive_count: basis?.positive_count ?? null,
    negative_count: basis?.negative_count ?? null,
    source_mix: basis?.source_mix ?? null,
    polarization_band: BALANCE_POLARIZATION_BAND[balance] ?? null,
    certainty_band: SUFFICIENCY_CERTAINTY_BAND[sufficiency] ?? 'low',
    source_diversity: comp?.source_diversity ?? 0,
    concentration_warning: basis?.concentration_warning ?? null,
    thin_evidence_instrument: thinPolicy?.instrument ?? null,
    shows_assessment: thinPolicy?.operatorShowsScore ?? sufficiency !== 'none',
    // Legacy key kept for UI compatibility; mirrors shows_assessment.
    operator_shows_score: thinPolicy?.operatorShowsScore ?? sufficiency !== 'none',
    interpretive_summary: interpretiveSummary === true,
    narrative_grounding_score: groundingScore ?? null,
    sampling_status: comp?.sampling_status ?? null,
  };

  if (isSoftVoidWarning(assessmentContext.dataVoid)) {
    instrument.sampling_degraded = true;
  }

  return instrument;
}

// ── Assessment summary ────────────────────────────────────────────────────────

/**
 * One-line qualitative assessment summary for chat/tools (count-based, no scores).
 *
 * @param {object | null | undefined} assessment
 * @returns {string}
 */
export function operatorAssessmentSummary(assessment) {
  const comps = assessment?.components ?? [];
  if (comps.length === 0) return 'No component data';
  let adequate = 0;
  let contested = 0;
  let thin = 0;
  let critical = 0;
  for (const c of comps) {
    const inst = c.instrument ?? deriveInstrumentState(c);
    if (inst.evidence_sufficiency === 'adequate') adequate += 1;
    if (inst.evidence_sufficiency === 'thin' || inst.evidence_sufficiency === 'none') thin += 1;
    if (inst.contested) contested += 1;
    if (inst.presence_gate_triggered || inst.salience_critical) critical += 1;
  }
  const scope = assessment?.report_scope?.label ?? assessment?.report_scope?.id ?? 'national';
  let summary =
    `Scope: ${scope}; components with adequate evidence: ${adequate}/${comps.length}; ` +
    `thin: ${thin}; contested: ${contested}; critical flags: ${critical}`;
  if (assessment?.comparison_context?.comparable === false
    || assessment?.national_comparison?.comparable === false) {
    summary += '; national comparison not comparable (source mix mismatch)';
  }
  return summary;
}

// ── Report payload passthrough (historical "redact" naming) ───────────────────

/**
 * Attach instrument state to every component; single evidence-based view (no redaction).
 *
 * @param {object} assessment
 * @param {'operator' | 'analyst'} [_view] Kept for call-site compatibility.
 * @returns {object}
 */
export function redactAssessmentForView(assessment, _view) {
  if (!assessment || typeof assessment !== 'object') return assessment;

  const assessmentContext = {
    dataVoid: assessment.data_void,
    epistemicStatus: assessment.epistemic_status,
  };

  const components = (assessment.components ?? []).map((c) => ({
    ...c,
    narrative: c.narrative_operator ?? c.narrative,
    evidence: c.evidence_operator_structured?.length
      ? c.evidence_operator_structured
      : (c.evidence_operator ?? c.evidence),
    instrument: deriveInstrumentState(c, assessmentContext),
  }));

  return {
    ...assessment,
    display_view: DISPLAY_VIEWS.operator,
    components,
    cross_component_synthesis:
      assessment.cross_component_synthesis_operator ?? assessment.cross_component_synthesis,
  };
}

/**
 * Passthrough for score-by-source buckets (min-math: no numeric scores to hide).
 *
 * @param {Record<string, Record<string, object>> | null | undefined} scoreBySource
 * @param {'operator' | 'analyst'} [_view]
 * @returns {Record<string, Record<string, object>> | null}
 */
export function redactScoreBySource(scoreBySource, _view) {
  return scoreBySource ?? null;
}

/**
 * Shape cached report payload for the single operator report surface.
 *
 * @param {object} payload Cached report payload (assessment, markdown, …).
 * @param {'operator' | 'analyst'} [view] Kept for call-site compatibility.
 * @returns {object}
 */
export function redactReportPayload(payload, view) {
  if (!payload || typeof payload !== 'object') return payload;
  const assessment = payload.assessment
    ? redactAssessmentForView(payload.assessment, view)
    : payload.assessment;
  return {
    ...payload,
    display_view: DISPLAY_VIEWS.operator,
    assessment,
  };
}

export { resolveDisplayView, DISPLAY_VIEWS } from '../../contracts/displayViews.js';
