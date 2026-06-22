/**
 * Display tiers for resilience assessments (operator vs analyst).
 * Full scores remain on disk; redaction applies at API/UI boundaries.
 */

import {
  DISPLAY_VIEWS,
  
} from '../../../../cross-cut-modules/resilience-contracts/displayViews.js';
import { deriveThinEvidencePolicy, isThinEvidencePolicyEnabled, deriveAssessmentEpistemicPolicy } from './thinEvidencePolicy.js';
import { narrativeGroundingMinScore } from './narrativeGrounding/groundingConfig.js';
import { isSoftVoidWarning } from '../../../../cross-cut-modules/resilience-contracts/softVoidReasons.js';



const SCORE_KEYS_COMPONENT = [
  'score',
  'score_smoothed',
  'score_low',
  'score_high',
  'strength',
  'adjusted_strength',
  'net_evidence',
  'positive_evidence',
  'negative_evidence',
  'evidence_mass',
  'certainty',
  'polarization',
  'coverage_ratio',
  'coverage_adjustment',
  'source_diversity_factor',
  'type_diversity_factor',
  'signal_type_entropy',
  'counterfactual_delta',
  'delta_score',
  'delta_significance',
  'score_raw',
  'score_headline',
  'suppression_delta',
  'suppression_breakdown',
  'score_calibrated',
  'calibration_trust',
  'calibration_deficit',
  'weight_sensitivity',
  'weight_sensitivity_note',
];

/**
 * @param {number|null|undefined} polarization
 * @param {number} mass
 * @returns {'one_sided'|'mixed'|'contested'|null}
 */
export function derivePolarizationBand(polarization, mass) {
  if (polarization == null || !Number.isFinite(polarization)) return null;
  if (polarization > 0.5 && mass > 4) return 'contested';
  if (polarization > 0.5) return 'mixed';
  return 'one_sided';
}

/**
 * @param {number|null|undefined} certainty
 * @returns {'low'|'medium'|'high'|null}
 */
export function deriveCertaintyBand(certainty) {
  if (certainty == null || !Number.isFinite(certainty)) return null;
  if (certainty < 0.35) return 'low';
  if (certainty < 0.65) return 'medium';
  return 'high';
}

/**
 * @param {object} comp
 * @param {object} [assessmentContext]
 * @returns {object}
 */
export function deriveInstrumentState(comp, assessmentContext = {}) {
  const view = assessmentContext.view ?? DISPLAY_VIEWS.operator;
  const isAnalyst = view === DISPLAY_VIEWS.analyst;
  const mass = Number(comp?.evidence_mass ?? 0);
  let evidence_sufficiency = 'adequate';
  if (mass < 1.5) evidence_sufficiency = 'thin';
  else if (mass < 4) evidence_sufficiency = 'moderate';

  const polarization = comp?.polarization ?? null;
  const contested =
    polarization != null
    && polarization > 0.5
    && mass > 4;

  const contestedThin =
    polarization != null
    && polarization > 0.5
    && mass >= 1.5
    && mass < 4;

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

  const suppressionDelta = comp?.suppression_delta ?? null;
  const suppressionActive =
    comp?.source_cap_binding === true
    || (suppressionDelta != null && Math.abs(suppressionDelta) >= 1);

  const instrument = {
    confidence: comp?.confidence ?? 'insufficient_data',
    evidence_sufficiency,
    contested: contested === true,
    contested_thin: thinPolicy?.contested_thin ?? contestedThin === true,
    significant_delta: comp?.delta_flag === 'significant',
    salience_critical: comp?.salience_critical === true,
    presence_gate_triggered: comp?.presence_gate_triggered === true,
    operator_status: comp?.operator_status ?? null,
    contested_evidence: contested === true,
    ci_unstable: comp?.ci_unstable === true,
    source_cap_binding: comp?.source_cap_binding === true,
    signal_count: comp?.signal_count ?? 0,
    distinct_article_count: comp?.distinct_article_count ?? 0,
    evidence_mass: mass > 0 ? Math.round(mass * 10) / 10 : 0,
    polarization: polarization == null ? null : Math.round(polarization * 100) / 100,
    polarization_band: derivePolarizationBand(polarization, mass),
    certainty_band: deriveCertaintyBand(comp?.certainty),
    source_diversity: comp?.source_diversity ?? 0,
    suppression_active: suppressionActive,
    thin_evidence_instrument: thinPolicy?.instrument ?? null,
    operator_shows_score: thinPolicy?.operatorShowsScore ?? (mass >= 1.5),
    calibration_limited: (comp?.calibration_deficit ?? 0) >= 0.5,
    interpretive_summary: interpretiveSummary === true,
    narrative_grounding_score: groundingScore ?? null,
    delta_flag: comp?.delta_flag === 'significant',
  };

  if (isSoftVoidWarning(assessmentContext.dataVoid)) {
    instrument.sampling_degraded = true;
  }

  if (isAnalyst) {
    instrument.suppression_delta = suppressionDelta;
    const contributors = comp?.top_contributors ?? comp?.signals ?? [];
    instrument.top_contributors = (Array.isArray(contributors) ? contributors : [])
      .slice(0, 3)
      .map((s) => ({
        signal_type: s.signal_type ?? s.type ?? null,
        source_type: s.source_type ?? null,
        evidence: s.evidence ? String(s.evidence).slice(0, 120) : null,
        _contribution_raw: s._contribution_raw ?? s._contribution ?? null,
      }));
  }

  return instrument;
}

/**
 * Derive a qualitative confidence band from component certainty values.
 * Returns { low: string, high: string } where each is 'low' | 'medium' | 'high'.
 * This gives the operator a directional sense of evidence quality without numeric scores.
 * @param {object | null | undefined} assessment
 * @returns {{ low: string, high: string } | null}
 */
function certaintyBand(v) {
  if (v < 0.35) return 'low';
  if (v < 0.65) return 'medium';
  return 'high';
}

export function deriveHeadlineBand(assessment) {
  const comps = assessment?.components ?? [];
  const certaintyValues = comps
    .map((c) => c.certainty)
    .filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (certaintyValues.length === 0) return null;
  const sorted = [...certaintyValues].sort((a, b) => a - b);
  const lo = sorted[0];
  const hi = sorted.at(-1);
  return { low: certaintyBand(lo), high: certaintyBand(hi) };
}

/**
 * Detect when narrative text direction contradicts shadow score direction.
 * Returns true when the shadow score is low (<= 4) but component narratives are
 * predominantly positive, or vice versa — a sign the LLM text diverges from math.
 * @param {object | null | undefined} assessment
 * @returns {boolean}
 */
export function detectNarrativeScoreDivergence(assessment) {
  const shadowScore = assessment?.shadow_scoring?.overall_score
    ?? assessment?.overall_resilience_score;
  if (typeof shadowScore !== 'number' || !Number.isFinite(shadowScore)) return false;
  const comps = assessment?.components ?? [];
  if (comps.length === 0) return false;
  const positiveNarrativeCount = comps.filter((c) => {
    const text = String(c.narrative ?? c.evidence_summary ?? '').toLowerCase();
    const posMatches = (text.match(/\b(good|positive|stable|strong|adequate|maintained|high)\b/g) ?? []).length;
    const negMatches = (text.match(/\b(risk|concern|decline|weak|crisis|critical|insufficient|lack)\b/g) ?? []).length;
    return posMatches > negMatches;
  }).length;
  const narrativePositiveRatio = positiveNarrativeCount / comps.length;
  if (shadowScore <= 4 && narrativePositiveRatio > 0.6) return true;
  if (shadowScore >= 7 && narrativePositiveRatio < 0.3) return true;
  return false;
}

/**
 * One-line operator-safe summary (no numeric 1–10 scores).
 * @param {object | null | undefined} assessment
 */
export function operatorAssessmentSummary(assessment) {
  const comps = assessment?.components ?? [];
  if (comps.length === 0) return 'No component data';
  let adequate = 0;
  let contested = 0;
  let thin = 0;
  let significant = 0;
  for (const c of comps) {
    const inst = c.instrument ?? deriveInstrumentState(c);
    if (inst.evidence_sufficiency === 'adequate') adequate += 1;
    if (inst.evidence_sufficiency === 'thin') thin += 1;
    if (inst.contested) contested += 1;
    if (inst.significant_delta) significant += 1;
  }
  const scope = assessment?.report_scope?.label ?? assessment?.report_scope?.id ?? 'national';
  let summary =
    `Scope: ${scope}; components with adequate evidence: ${adequate}/${comps.length}; ` +
    `thin: ${thin}; contested: ${contested}; significant shifts: ${significant}`;
  if (assessment?.comparison_context?.comparable === false
    || assessment?.national_comparison?.comparable === false) {
    summary += '; national comparison not comparable (source mix mismatch)';
  }
  return summary;
}

function omitKeys(obj, keys) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  for (const k of keys) delete out[k];
  return out;
}

function redactFacet(facet) {
  if (!facet || typeof facet !== 'object') return facet;
  return omitKeys(facet, ['score', 'strength', 'adjusted_strength', 'evidence_mass', 'net_evidence']);
}

function redactNorrisCap(cap) {
  if (!cap || typeof cap !== 'object') return cap;
  return omitKeys(cap, ['score', 'certainty', 'evidence_mass']);
}

function resolveOperatorEvidence(component) {
  const structuredEvidence = component.evidence_operator_structured ?? [];
  if (structuredEvidence.length > 0) return structuredEvidence;
  return component.evidence_operator ?? component.evidence;
}

/**
 * @param {object} assessment
 * @param {'operator' | 'analyst'} view
 * @returns {object}
 */
export function redactAssessmentForView(assessment, view) {
  if (!assessment || typeof assessment !== 'object') return assessment;

  const isOperator = view === DISPLAY_VIEWS.operator;
  const operatorSynthesis = isOperator
    ? (assessment.cross_component_synthesis_operator ?? assessment.cross_component_synthesis)
    : assessment.cross_component_synthesis;

  const components = (assessment.components ?? []).map((c) => {
    const base = omitKeys(c, SCORE_KEYS_COMPONENT);
    delete base.delta_flag;
    delete base.counterfactual_article_key;
    delete base.dispersion;
    delete base.reviewer_score_adjusted;
    if (isOperator) {
      delete base.narrative_claims;
      delete base.grounding_issues;
      delete base.narrative_grounding_score;
      delete base.interpretive_summary;
      delete base.analyst_flags;
      delete base.operator_state_inputs;
      delete base.assessment_state;
      delete base.narrative_operator;
      delete base.evidence_operator;
      delete base.evidence_operator_structured;
      delete base.data_quality_caveat;
    }
    const facets = Array.isArray(c.facets)
      ? c.facets.map(redactFacet)
      : c.facets;
    const assessmentContext = {
      dataVoid: assessment.data_void,
      epistemicStatus: assessment.epistemic_status,
      view,
    };
    const narrative = isOperator
      ? (c.narrative_operator ?? c.narrative)
      : c.narrative;
    const evidence = isOperator ? resolveOperatorEvidence(c) : c.evidence;
    return {
      ...base,
      narrative,
      evidence,
      facets,
      instrument: deriveInstrumentState(c, assessmentContext),
    };
  });

  const norris = Array.isArray(assessment.norris_capacities)
    ? assessment.norris_capacities.map(redactNorrisCap)
    : assessment.norris_capacities;

  const headlineBand = deriveHeadlineBand(assessment);
  const narrativeDivergence = detectNarrativeScoreDivergence(assessment);

  const out = {
    ...assessment,
    display_view: view,
    components,
    cross_component_synthesis: operatorSynthesis,
    norris_capacities: norris,
    ...(headlineBand ? { headline_band: headlineBand } : {}),
    ...(narrativeDivergence ? { narrative_score_divergence: true } : {}),
  };
  delete out.overall_resilience_score;
  if (isOperator) {
    delete out.cross_component_synthesis_operator;
    delete out.investigation_summary;
  }
  if (Array.isArray(out.national_context_signals) && out.national_context_signals.length > 0) {
    out.national_context_summary = out.national_context_summary ?? {
      count: out.national_context_signals.length,
      provenance_counts: {},
    };
  } else if (view === DISPLAY_VIEWS.operator && Array.isArray(out.macro_signals) && out.macro_signals.length > 0) {
    out.national_context_signals = out.macro_signals.map((s) => ({
      signal_type: s.signal_type ?? s.type ?? null,
      evidence: s.evidence ?? '',
      signalProvenance: s.signalProvenance ?? 'macro_national',
      source_type: s.source_type ?? null,
    }));
    out.national_context_summary = {
      count: out.national_context_signals.length,
      provenance_counts: { macro_national: out.national_context_signals.length },
    };
  }
  if (view === DISPLAY_VIEWS.operator) {
    delete out.component_diagnostics;
    delete out.component_id_warnings;
    delete out.shadow_scoring;
    delete out.macro_signals;
  }
  if (out.national_comparison && typeof out.national_comparison === 'object') {
    out.national_comparison = omitKeys(out.national_comparison, [
      'overall_resilience_score',
      'score',
    ]);
  }
  return out;
}

/**
 * @param {Record<string, Record<string, object>> | null | undefined} scoreBySource
 * @param {'operator' | 'analyst'} view
 */
export function redactScoreBySource(scoreBySource, _view) {
  if (!scoreBySource || typeof scoreBySource !== 'object') return scoreBySource;

  const out = {};
  for (const [sourceKey, byComponent] of Object.entries(scoreBySource)) {
    if (!byComponent || typeof byComponent !== 'object') {
      out[sourceKey] = byComponent;
      continue;
    }
    const compOut = {};
    for (const [compId, compData] of Object.entries(byComponent)) {
      if (!compData || typeof compData !== 'object') {
        compOut[compId] = compData;
        continue;
      }
      compOut[compId] = {
        signals: compData.signals ?? [],
        instrument: compData.score == null ? undefined : deriveInstrumentState(compData),
      };
    }
    out[sourceKey] = compOut;
  }
  return out;
}

/**
 * @param {object} payload  Cached report payload (assessment, markdown, score_by_source, …)
 * @param {'operator' | 'analyst'} view
 */
export function redactReportPayload(payload, view) {
  if (!payload || typeof payload !== 'object') return payload;
  const assessment = payload.assessment
    ? redactAssessmentForView(payload.assessment, view)
    : payload.assessment;
  const score_by_source = redactScoreBySource(
    payload.score_by_source ?? payload.scoreBySource,
    view,
  );
  const out = {
    ...payload,
    display_view: view,
    assessment,
    ...(score_by_source == null ? {} : { score_by_source }),
  };
  if (view === DISPLAY_VIEWS.operator && typeof payload.markdown_brief === 'string' && payload.markdown_brief.trim()) {
    out.markdown = payload.markdown_brief;
  }
  return out;
}

/**
 * Default for narrative LLM prompts (Layer B).
 */
export function narrativeIncludesScores() {
  const v = String(process.env.RESILIENCE_NARRATIVE_INCLUDE_SCORES ?? 'false').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export {resolveDisplayView, DISPLAY_VIEWS} from '../../../../cross-cut-modules/resilience-contracts/displayViews.js';