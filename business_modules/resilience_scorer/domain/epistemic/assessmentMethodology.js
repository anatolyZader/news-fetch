/**
 * Assessment methodology metadata for auditors and operator-facing copy.
 *
 * Pipeline position: assess/report — embedded in artifacts via buildAssessmentMethodology.
 *
 * Owns: SCORING_MODEL_VERSION/changelog, methodology JSON builders, stderr log formatters.
 * Does NOT: compute count-based evidence bands or epistemic profiles (componentEvidence.js, epistemicProfileBuilder.js).
 *
 * Key collaborators: assessSignalsCli.js, signalRouter.js, pipelineStageTelemetry.js, geo/signalGeoSummary.js.
 */

import { createHash } from 'node:crypto';
import { CATALOG_VERSION, SIGNAL_TO_COMPONENTS, SIGNAL_TYPES } from '../services/signals/routing/signalRouter.js';
import { EQUITY_RELEVANT_TYPES } from '../services/signals/signalInstanceSchema.js';
import { extractionTelemetryForOperator } from '../services/pipeline/pipelineStageTelemetry.js';
import { summarizeGeoQuality } from '../../../../cross-cut-modules/geo/signalGeoSummary.js';
import {
  ISRAEL_REGIONAL_DISTRICT_ORDER,
} from '../../../../cross-cut-modules/geo/israelDistricts.js';
import { isRegionalReportScope, normalizeReportScopeId } from '../../../../cross-cut-modules/geo/reportScopeIds.js';
import { DEFAULT_NORTH_SOURCE_TYPES } from '../services/signals/signalDistrictId.js';

/**
 * Version string stamped into methodology and report artifacts.
 * Bump when SIGNAL_TO_COMPONENTS or catalog/routing contracts change materially;
 * add a matching SCORING_MODEL_CHANGELOG entry.
 */
export const SCORING_MODEL_VERSION = 'v10';

/**
 * Human-maintained changelog paired with SCORING_MODEL_VERSION.
 * Newest first. Required when bumping the version.
 */
export const SCORING_MODEL_CHANGELOG = [
  {
    version: 'v10',
    date: '2026-07-24',
    summary:
      'Construct-role epoch. Every catalog entry carries a mandatory construct_role (pressure/capacity/response/population_state/institutional_state/outcome/narrative_frame), replacing the sparse indicator_kind; the response/capacity no-positive-wellbeing rule is now enforced catalog-wide — five remaining "+ wellbeing" edges removed (community_volunteering, solidarity_help_others, resource_mobilization, workplace_flexibility_response; school_psychosocial_support_active re-anchored to community_capital). novel_behavior_observed became a non-scoring fallback (all edges inferred; OOV synthetics no longer move wellbeing bands). Multi-primary review: functional_continuity demoted to inferred on coordination_failure and resource_shortage; bridging_capital_failure symmetrized to primary community_capital. Mirror routing asymmetries must now carry a documented reason (MIRROR_ROUTING_ASYMMETRY, 25 entries). getRoutingRole is fail-closed (missing edge → null, no silent primary). Evidence bands add construct_role_mix; reports gain exposure_context and trajectory_context. Wellbeing/community-capital band comparability breaks pre/post; catalog vocabulary (CATALOG_VERSION v8) and extraction prompts unchanged — extraction cache remains valid.',
  },
  {
    version: 'v9',
    date: '2026-07-21',
    summary:
      'Routing edges made discrete: SIGNAL_TO_COMPONENTS numeric weights replaced by { polarity, role } edges (mechanical conversion: polarity = weight sign, role = primary when |w| >= 0.5 else inferred; novel_behavior_observed keeps wellbeing primary). Evidence bands (sufficiency/balance/concentration) now count primary-role edges only; inferred edges reported as inferred_context and labeled in signal lists. Weight-overlay plumbing removed (was never used). Pre/post reports not comparable.',
  },
  {
    version: 'v8',
    date: '2026-07-20',
    summary:
      'compliance_partial flipped to defaultPolarity negative (deficiency reading; routing weights now lifesaving_behavior -0.6 / leadership -0.2, polarity_override: positive for glass-half-full evidence) — pre/post reports not comparable for this type. Four new signal types with routing: panic_buying_hoarding (resources), return_intention_expressed / relocation_intention_expressed mirror pair (continuity), misinformation_acted_upon (information).',
  },
  {
    version: 'v7',
    date: '2026-07-19',
    summary:
      'min-math: numeric scoring engine removed (mass/caps/CI/EWMA/calibration). Components carry count-based evidence bands (sufficiency/balance/concentration) plus presence-gate and critical-signal flags; reports are narrative-first with no 1–10 scores. SIGNAL_TO_COMPONENTS routing unchanged.',
  },
  {
    version: 'v6',
    date: '2026-07-13',
    summary:
      'Catalog v7: inferred-route discount (×0.5) on secondary component edges (SIGNAL_ROUTING_ROLES); response/coping signals no longer add positive wellbeing_at_risk mass (wellbeing_support_accessed rerouted to community_capital/functional_continuity; help_seeking, religious_coping, hostage_advocacy wellbeing edges dropped); population_survey_finding demoted to polarity-overridable fallback (info_comm edge dropped); leadership_visible_present alias removed from vocabulary and mapping (ingestion-only alias, canonicalized at scoring); mirror pairs restricted to reciprocal opposite-polarity twins.',
  },
  {
    version: 'v5',
    date: '2026-05-19',
    summary:
      'Catalog v6: disambiguation metadata, mirror pairs, 7 new signal types, expanded scoringPriors, derived indicators, facet coverage, catalog-driven extraction prompts.',
  },
  {
    version: 'v3',
    date: '2026-03-01',
    summary:
      'Author-set SIGNAL_TO_COMPONENTS and heuristic COMPONENT_TUNING (tanhK/certM). Not ML-fitted on crisis outcomes.',
  },
];

/**
 * @deprecated Use DEFAULT_NORTH_SOURCE_TYPES from signalDistrictId.js instead.
 * Preserved for legacy report readers that still reference phase-1 north defaults.
 */
export const PHASE1_ALWAYS_NORTH_SOURCE_TYPES = [...DEFAULT_NORTH_SOURCE_TYPES];

/** Operator-facing note on how signal.district_id and source_type interact with report scope. */
const SIGNAL_DISTRICT_SCOPE_NOTE =
  'Structured feeds stamp signal.district_id at extract (or inherit from bundle at assess). North-domain feeds (field, pbo, whatsapp, etc.) without district_id default to north — these sources are exclusively north-domain. Regional scope uses signal district plus resolved geo tags — not source_type alone.';

// --- Scope & equity summaries ---

/**
 * Report-quality metric: how often equity-relevant signals name an affected_subgroup.
 *
 * @param {Array<object>} signals
 * @returns {{
 *   equity_signal_count: number,
 *   subgroup_named_count: number,
 *   pct_subgroup_named: number|null,
 *   by_subgroup: Record<string, number>,
 * }}
 */
export function summarizeSubgroupCoverage(signals) {
  const list = Array.isArray(signals) ? signals : [];
  const equitySignals = list.filter((s) => {
    const t = s?.signal_type ?? s?.type;
    return t && EQUITY_RELEVANT_TYPES.has(t);
  });
  const withSubgroup = equitySignals.filter((s) => s.affected_subgroup);
  const bySubgroup = {};
  for (const s of withSubgroup) {
    const g = s.affected_subgroup;
    bySubgroup[g] = (bySubgroup[g] ?? 0) + 1;
  }
  const equityCount = equitySignals.length;
  return {
    equity_signal_count: equityCount,
    subgroup_named_count: withSubgroup.length,
    pct_subgroup_named: equityCount > 0
      ? Math.round((1000 * withSubgroup.length) / equityCount) / 10
      : null,
    by_subgroup: bySubgroup,
  };
}

/**
 * Count how each signal resolved report-scope relevance (by scopeDecision.source).
 * Adds scope_relevant_signals / north_relevant_signals when a regional scope is active.
 *
 * @param {Array<object>} signals
 * @param {{ reportScopeId?: string }} [opts]
 * @returns {{ total_signals: number, by_source: Record<string, number>, scope_relevant_signals?: number, north_relevant_signals?: number }}
 */
export function summarizeScopeDecisionSources(signals, opts = {}) {
  const list = Array.isArray(signals) ? signals : [];
  const bySource = {};
  let scopeRelevant = 0;

  for (const s of list) {
    const src = s?.scopeDecision?.source ?? 'unset';
    bySource[src] = (bySource[src] ?? 0) + 1;

    if (s?.scopeDecision?.isScopeRelevant) {
      scopeRelevant += 1;
    }
  }

  const total = list.length;
  const summary = {
    total_signals: total,
    by_source: bySource,
  };

  const scopeId = normalizeReportScopeId(opts.reportScopeId);
  if (isRegionalReportScope(scopeId) || scopeRelevant > 0) {
    summary.scope_relevant_signals = scopeRelevant;
    if (scopeId === 'north') {
      summary.north_relevant_signals = scopeRelevant;
    }
  }

  return summary;
}

// --- Model manifest & report methodology ---

/**
 * Full on-disk scoring-model manifest (analyst audit): includes the full
 * SIGNAL_TO_COMPONENTS edge table and a sha256 of its JSON.
 * Not exposed on the operator API tier (strip via methodologyForOperatorView).
 * @returns {object}
 */
export function buildScoringModelManifest() {
  const weightsJson = JSON.stringify(SIGNAL_TO_COMPONENTS);
  return {
    scoring_model_version: SCORING_MODEL_VERSION,
    generated_at: new Date().toISOString(),
    weights: 'author_set',
    weights_note: 'SIGNAL_TO_COMPONENTS is an author-set table of discrete polarity/role edges; not fitted on crisis ground truth.',
    changelog: [...SCORING_MODEL_CHANGELOG],
    signal_to_components_sha256: createHash('sha256').update(weightsJson).digest('hex'),
    signal_type_count: SIGNAL_TYPES.length,
    signal_to_components: SIGNAL_TO_COMPONENTS,
  };
}

/**
 * Assemble the methodology block embedded in assessment reports: model metadata,
 * active scope, governance notes, limitations, and count-based epistemic policy
 * summaries (thin/contested evidence — no numeric resilience scores).
 *
 * @param {{
 *   signals: Array<object>,
 *   reportScopeId?: string,
 *   scoringModelManifest?: object | null,
 *   tuningProposal?: object | null,
 *   extractionTelemetry?: object | null,
 * }} opts
 * @returns {object}
 */
export function buildAssessmentMethodology({
  signals,
  reportScopeId = 'national',
  scoringModelManifest = null,
  tuningProposal = null,
  extractionTelemetry = null,
} = {}) {
  const scopeId = normalizeReportScopeId(reportScopeId);

  return {
    phase: 'multi_district_phase2',
    scoring: {
      weights: 'author_set',
      model: 'count_based_evidence_bands',
      llm_extracts_code_derives_evidence: true,
      scoring_model_version: SCORING_MODEL_VERSION,
      catalog_version: CATALOG_VERSION,
    },
    scope: {
      regional_slices: [...ISRAEL_REGIONAL_DISTRICT_ORDER],
      active_scope: scopeId,
      default_north_source_types: [...DEFAULT_NORTH_SOURCE_TYPES],
      signal_district_scope_note: SIGNAL_DISTRICT_SCOPE_NOTE,
      scope_decision_summary: summarizeScopeDecisionSources(signals, { reportScopeId: scopeId }),
      ...(Array.isArray(signals) && signals.some((s) => s && 'geo' in s)
        ? { geo_quality_summary: summarizeGeoQuality(signals) }
        : {}),
    },
    governance: {
      weights_steward: 'analyst_and_product_review',
      weights_change_process:
        'Edits to SIGNAL_TO_COMPONENTS require bumping scoring_model_version and an entry in SCORING_MODEL_CHANGELOG (assessmentMethodology.js).',
      headline_scores_are:
        'Deterministic model outputs for triage and narrative context—not policy directives or legal findings.',
      operator_accountability:
        'Public-facing layer: behavioral narratives and cited evidence. Numeric scores are internal/analyst tooling unless explicitly enabled.',
    },
    limitations: {
      signal_weights: 'author_set_discrete_edges_not_ml_fitted',
      component_tuning: 'none (count-based evidence bands)',
      regional_geo_news:
        'All pipeline sources receive resolved geo envelopes via geoService. Text-inferred locality on news/radio/social is scope hint only (usableForMetrics=false); structured locality and signal.district_id drive regional metrics.',
      default_north_source_types: [...DEFAULT_NORTH_SOURCE_TYPES],
      dual_pipeline:
        'Evidence submission analysis scores all signals without scope filter; regional artifacts require assess-signals --scope <districtId>',
      extraction_quality:
        'LLM extraction verified per signal (embedding/NLI grounding tiers); no production SLA',
      subgroup_coverage: summarizeSubgroupCoverage(signals),
      ...(extractionTelemetry ? { extraction_pipeline_stages: extractionTelemetry } : {}),
    },
    epistemic: {
      report_view: 'narrative_and_evidence_no_numeric_scores',
      thin_evidence_policy:
        'Components with sufficiency none/thin present limited_evidence_neutral or insufficient_data instruments; critical single signals surface via presence gates and the curated critical-type set.',
      contested_evidence:
        'When supporting and opposing signal counts are split (balance=contested), the narrative must describe the conflict without resolving it.',
      keyword_macro_partition:
        'National macro terms and metrics-unsafe geo are scope context only — excluded from component evidence when RESILIENCE_EPISTEMIC_GEO_V2 is enabled.',
      reliability_instruments:
        'Sufficiency, balance, and concentration bands derive from signal counts and source diversity; they do not validate ground-truth resilience.',
    },
    scoring_model: scoringModelManifest ?? undefined,
    tuning_proposal: tuningProposal ?? null,
  };
}

// --- Operator view & CLI logging ---

/**
 * Operator-safe methodology: drops full weight matrix; redacts tuning and
 * extraction telemetry to summary fields only.
 * @param {object | null | undefined} methodology
 * @returns {object | null | undefined}
 */
export function methodologyForOperatorView(methodology) {
  if (!methodology || typeof methodology !== 'object') return methodology;
  const out = { ...methodology };
  delete out.scoring_model;
  if (out.limitations?.extraction_pipeline_stages) {
    out.limitations = {
      ...out.limitations,
      extraction_pipeline_stages: extractionTelemetryForOperator(
        out.limitations.extraction_pipeline_stages,
      ),
    };
  }
  if (out.tuning_proposal) {
    out.tuning_proposal = {
      status: out.tuning_proposal.status ?? 'advisory_only',
      present: true,
      report_count: out.tuning_proposal.report_count ?? null,
      skipped_reason: out.tuning_proposal.skipped_reason ?? null,
    };
  }
  return out;
}

/**
 * One-line stderr summary for assess-signals scope-decision telemetry.
 *
 * @param {object} methodology
 * @returns {string}
 */
export function formatScopeDecisionLogLine(methodology) {
  const s = methodology?.scope?.scope_decision_summary;
  if (!s) return '';
  const parts = Object.entries(s.by_source ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}=${n}`);
  let line = `  → Scope decisions: ${parts.join(', ')}`;
  return line;
}

/**
 * One-line stderr summary for equity subgroup tagging coverage.
 *
 * @param {object} methodology
 * @returns {string}
 */
export function formatSubgroupCoverageLogLine(methodology) {
  const sc = methodology?.limitations?.subgroup_coverage;
  if (!sc || sc.equity_signal_count === 0) return '';
  return `  → Equity signals with affected_subgroup: ${sc.subgroup_named_count}/${sc.equity_signal_count} (${sc.pct_subgroup_named ?? 0}%)`;
}
