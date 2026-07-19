/**
 * Assessment methodology metadata (phase 1: national + north only).
 * Documents limits of the instrument for auditors and operator-facing copy.
 */

import { createHash } from 'node:crypto';
import {
  SIGNAL_TO_COMPONENTS,
  SIGNAL_TYPES,
  EQUITY_RELEVANT_TYPES,
} from '../services/signals/behaviorSignals.js';
import { extractionTelemetryForOperator } from '../services/pipelineStageTelemetry.js';
import { summarizeGeoQuality } from '../../../../cross-cut-modules/geo/signalGeoSummary.js';
import {
  ISRAEL_REGIONAL_DISTRICT_ORDER,
} from '../../../../cross-cut-modules/geo/israelDistricts.js';
import { isRegionalReportScope, normalizeReportScopeId } from '../../../../cross-cut-modules/geo/reportScopeIds.js';
import { DEFAULT_NORTH_SOURCE_TYPES } from '../services/signals/signalDistrictId.js';

export const SCORING_MODEL_VERSION = 'v6';

/** Human-maintained; bump SCORING_MODEL_VERSION when SIGNAL_TO_COMPONENTS changes materially. */
export const SCORING_MODEL_CHANGELOG = [
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
      'Author-set SIGNAL_TO_COMPONENTS routing; evidence sufficiency/balance derive from signal counts and source diversity. No numeric scoring model.',
  },
];

/** @deprecated use DEFAULT_NORTH_SOURCE_TYPES from signalDistrictId.js */
export const PHASE1_ALWAYS_NORTH_SOURCE_TYPES = [...DEFAULT_NORTH_SOURCE_TYPES];

const SIGNAL_DISTRICT_SCOPE_NOTE =
  'Structured feeds stamp signal.district_id at extract (or inherit from bundle at assess). North-domain feeds (field, pbo, whatsapp, etc.) without district_id default to north — these sources are exclusively north-domain. Regional scope uses signal district plus resolved geo tags — not source_type alone.';

/**
 * Report-quality metric: how often equity-relevant signals name an affected_subgroup.
 * @param {Array<object>} signals
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
 * @param {Array<object>} signals
 * @param {{ reportScopeId?: string }} [opts]
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

/**
 * Full manifest for on-disk JSON (analyst audit). Not exposed to operator API tier.
 */
export function buildScoringModelManifest() {
  const weightsJson = JSON.stringify(SIGNAL_TO_COMPONENTS);
  return {
    scoring_model_version: SCORING_MODEL_VERSION,
    generated_at: new Date().toISOString(),
    weights: 'author_set',
    weights_note: 'SIGNAL_TO_COMPONENTS is author-set; not fitted on crisis ground truth.',
    changelog: [...SCORING_MODEL_CHANGELOG],
    signal_to_components_sha256: createHash('sha256').update(weightsJson).digest('hex'),
    signal_type_count: SIGNAL_TYPES.length,
    signal_to_components: SIGNAL_TO_COMPONENTS,
  };
}

/**
 * @param {{
 *   signals: Array<object>,
 *   reportScopeId?: string,
 *   scoringModelManifest?: object | null,
 *   tuningProposal?: object | null,
 *   extractionTelemetry?: object | null,
 * }} opts
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
      signal_weights: 'author_set_not_ml_fitted',
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

/**
 * Operator-safe methodology (no full weight matrix or tuning detail).
 * @param {object | null | undefined} methodology
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
 * One-line stderr summary for assess-signals.
 * @param {object} methodology
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
 * @param {object} methodology
 */
export function formatSubgroupCoverageLogLine(methodology) {
  const sc = methodology?.limitations?.subgroup_coverage;
  if (!sc || sc.equity_signal_count === 0) return '';
  return `  → Equity signals with affected_subgroup: ${sc.subgroup_named_count}/${sc.equity_signal_count} (${sc.pct_subgroup_named ?? 0}%)`;
}
