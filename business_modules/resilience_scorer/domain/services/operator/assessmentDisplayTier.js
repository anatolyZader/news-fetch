/**
 * Instrument state and report-payload shaping (single evidence-based view).
 *
 * There is no numeric score anywhere in the assessment, so the former
 * operator/analyst redaction collapsed into a passthrough that attaches the
 * qualitative `instrument` object the UI and chat layers render from. The
 * `view` parameters are kept for call-site compatibility.
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

const BALANCE_POLARIZATION_BAND = {
  one_sided_pos: 'one_sided',
  one_sided_neg: 'one_sided',
  mixed: 'mixed',
  contested: 'contested',
};

/**
 * @param {object} comp evidence component (or legacy stored component)
 * @param {object} [assessmentContext]
 * @returns {object}
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

/**
 * One-line assessment summary (qualitative, no numeric scores).
 * @param {object | null | undefined} assessment
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

/**
 * Attach instrument state to every component. No redaction — single view.
 * @param {object} assessment
 * @param {'operator' | 'analyst'} [_view] kept for call-site compatibility
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
 * @param {Record<string, Record<string, object>> | null | undefined} scoreBySource
 * @param {'operator' | 'analyst'} [_view]
 */
export function redactScoreBySource(scoreBySource, _view) {
  return scoreBySource ?? null;
}

/**
 * @param {object} payload  Cached report payload (assessment, markdown, …)
 * @param {'operator' | 'analyst'} [view] kept for call-site compatibility
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
