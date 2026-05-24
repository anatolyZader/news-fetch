/**
 * Display tiers for resilience assessments (operator vs analyst).
 * Full scores remain on disk; redaction applies at API/UI boundaries.
 */

import { deriveThinEvidencePolicy, isThinEvidencePolicyEnabled } from './thinEvidencePolicy.js';

export const DISPLAY_VIEWS = Object.freeze({
  operator: 'operator',
  analyst: 'analyst',
});

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
];

function parseAnalystAllowlist() {
  const raw = process.env.RESILIENCE_ANALYST_EMAILS ?? '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * @param {{ queryView?: string, userEmail?: string | null }} opts
 * @returns {'operator' | 'analyst'}
 */
export function resolveDisplayView({ queryView, userEmail } = {}) {
  const requested = String(queryView ?? 'operator').trim().toLowerCase();
  if (requested !== DISPLAY_VIEWS.analyst) {
    return DISPLAY_VIEWS.operator;
  }
  const email = String(userEmail ?? '').trim().toLowerCase();
  if (!email) return DISPLAY_VIEWS.operator;
  const allowlist = parseAnalystAllowlist();
  if (allowlist.length === 0) return DISPLAY_VIEWS.operator;
  return allowlist.includes(email) ? DISPLAY_VIEWS.analyst : DISPLAY_VIEWS.operator;
}

/**
 * @param {string | null | undefined} email
 * @returns {boolean}
 */
export function canViewAnalystDisplay(email) {
  const normalized = String(email ?? '').trim().toLowerCase();
  if (!normalized) return false;
  const allowlist = parseAnalystAllowlist();
  return allowlist.length > 0 && allowlist.includes(normalized);
}

/**
 * @param {object} comp
 * @returns {object}
 */
export function deriveInstrumentState(comp) {
  const mass = Number(comp?.evidence_mass ?? 0);
  let evidence_sufficiency = 'adequate';
  if (mass < 1.5) evidence_sufficiency = 'thin';
  else if (mass < 4) evidence_sufficiency = 'moderate';

  const contested =
    comp?.polarization != null
    && comp.polarization > 0.5
    && mass > 4;

  const contestedThin =
    comp?.polarization != null
    && comp.polarization > 0.5
    && mass >= 1.5
    && mass < 4;

  const thinPolicy = isThinEvidencePolicyEnabled()
    ? deriveThinEvidencePolicy(comp)
    : null;

  return {
    confidence: comp?.confidence ?? 'insufficient_data',
    evidence_sufficiency,
    contested: contested === true,
    contested_thin: thinPolicy?.contested_thin ?? contestedThin === true,
    significant_delta: comp?.delta_flag === 'significant',
    floor_clamped: comp?.floor_clamped === true,
    ci_unstable: comp?.ci_unstable === true,
    source_cap_binding: comp?.source_cap_binding === true,
    signal_count: comp?.signal_count ?? 0,
    distinct_article_count: comp?.distinct_article_count ?? 0,
    thin_evidence_instrument: thinPolicy?.instrument ?? null,
    operator_shows_score: thinPolicy?.operatorShowsScore ?? (mass >= 1.5),
    suppression_delta: comp?.suppression_delta ?? null,
  };
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
  return (
    `Scope: ${scope}; components with adequate evidence: ${adequate}/${comps.length}; ` +
    `thin: ${thin}; contested: ${contested}; significant shifts: ${significant}`
  );
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

/**
 * @param {object} assessment
 * @param {'operator' | 'analyst'} view
 * @returns {object}
 */
export function redactAssessmentForView(assessment, view) {
  if (!assessment || typeof assessment !== 'object') return assessment;
  if (view === DISPLAY_VIEWS.analyst) {
    return { ...assessment, display_view: DISPLAY_VIEWS.analyst };
  }

  const components = (assessment.components ?? []).map((c) => {
    const base = omitKeys(c, SCORE_KEYS_COMPONENT);
    delete base.delta_flag;
    delete base.counterfactual_article_key;
    delete base.dispersion;
    delete base.reviewer_score_adjusted;
    const facets = Array.isArray(c.facets)
      ? c.facets.map(redactFacet)
      : c.facets;
    return {
      ...base,
      facets,
      instrument: deriveInstrumentState(c),
    };
  });

  const norris = Array.isArray(assessment.norris_capacities)
    ? assessment.norris_capacities.map(redactNorrisCap)
    : assessment.norris_capacities;

  const out = {
    ...assessment,
    display_view: DISPLAY_VIEWS.operator,
    components,
    norris_capacities: norris,
  };
  delete out.overall_resilience_score;
  if (Array.isArray(out.macro_signals) && out.macro_signals.length > 0) {
    out.macro_signals_summary = {
      count: out.macro_signals.length,
      signal_types: [...new Set(out.macro_signals.map((s) => s.signal_type ?? s.type).filter(Boolean))],
    };
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
export function redactScoreBySource(scoreBySource, view) {
  if (!scoreBySource || typeof scoreBySource !== 'object') return scoreBySource;
  if (view === DISPLAY_VIEWS.analyst) return scoreBySource;

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
 * Fastify helper: 403 unless request may use analyst view.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {boolean} true if allowed
 */
export function requireAnalystView(request, reply) {
  const view = resolveDisplayView({
    queryView: 'analyst',
    userEmail: request.user?.email,
  });
  if (view !== DISPLAY_VIEWS.analyst) {
    reply.code(403).send({
      error: 'Forbidden',
      code: 'analyst_view_required',
      message: 'Analyst display tier required (RESILIENCE_ANALYST_EMAILS + authenticated email).',
    });
    return false;
  }
  return true;
}

/**
 * Default for narrative LLM prompts (Layer B).
 */
export function narrativeIncludesScores() {
  const v = String(process.env.RESILIENCE_NARRATIVE_INCLUDE_SCORES ?? 'false').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
