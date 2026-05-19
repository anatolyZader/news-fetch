/**
 * Assessment methodology metadata (phase 1: national + north only).
 * Documents limits of the instrument for auditors and operator-facing copy.
 */

import { createHash } from 'node:crypto';
import {
  COMPONENT_TUNING,
  SIGNAL_TO_COMPONENTS,
  SIGNAL_TYPES,
  EQUITY_RELEVANT_TYPES,
} from './behaviorSignals.js';
import { extractionTelemetryForOperator } from './pipelineStageTelemetry.js';
import { summarizeGeoQuality } from '../../../../cross-cut-modules/geo/signalGeoSummary.js';

export const SCORING_MODEL_VERSION = 'v5';

/** Human-maintained; bump SCORING_MODEL_VERSION when SIGNAL_TO_COMPONENTS changes materially. */
export const SCORING_MODEL_CHANGELOG = [
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

export const PHASE1_ALWAYS_NORTH_SOURCE_TYPES = [
  'field',
  'pbo',
  'pbo_regional',
  'naftali',
  'whatsapp',
];

const NORTH_COLLECTION_NOTE =
  'Signals from these source types are treated as north-relevant because ingestion is north-theater scoped in phase 1. A future district model will replace this assumption.';

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
  let northRelevant = 0;
  let northKeywordFallback = 0;

  for (const s of list) {
    const src = s?.scopeDecision?.source ?? 'unset';
    bySource[src] = (bySource[src] ?? 0) + 1;

    if (s?.scopeDecision?.isNorthRelevant) {
      northRelevant += 1;
      if (src === 'keyword_fallback') northKeywordFallback += 1;
    }
  }

  const total = list.length;
  const northDenom = northRelevant > 0 ? northRelevant : 1;
  const summary = {
    total_signals: total,
    by_source: bySource,
  };

  if (opts.reportScopeId === 'north' || northRelevant > 0) {
    summary.north_relevant_signals = northRelevant;
    summary.north_keyword_fallback_count = northKeywordFallback;
    summary.pct_keyword_fallback_among_north = Math.round((1000 * northKeywordFallback) / northDenom) / 10;
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
    component_tuning: { ...COMPONENT_TUNING },
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
  const scopeId = reportScopeId === 'north' ? 'north' : 'national';

  return {
    phase: 'national_and_north_only',
    scoring: {
      weights: 'author_set',
      tuning: 'heuristic',
      llm_extracts_code_scores: true,
      scoring_model_version: SCORING_MODEL_VERSION,
    },
    scope: {
      regional_slices: ['north'],
      active_scope: scopeId,
      north_collection_contract: {
        always_north_source_types: [...PHASE1_ALWAYS_NORTH_SOURCE_TYPES],
        note: NORTH_COLLECTION_NOTE,
      },
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
      component_tuning: 'heuristic_tanhK_certM; see tuning_proposal when enough national history',
      north_geo_news:
        'News/radio north scope may use keyword_fallback when geo is missing or not usableForMetrics',
      always_north_source_types: [...PHASE1_ALWAYS_NORTH_SOURCE_TYPES],
      dual_pipeline:
        'runResilienceAssessment (API/news) scores all signals without scope filter; north artifact requires assess-signals --scope north',
      extraction_quality:
        'LLM extraction monitored via tests/fixtures/resilience-golden (npm test golden-corpus); no production SLA',
      subgroup_coverage: summarizeSubgroupCoverage(signals),
      ...(extractionTelemetry ? { extraction_pipeline_stages: extractionTelemetry } : {}),
    },
    norris_lens: {
      measures: 'Synthetic 4Rs (robustness/redundancy/rapidity/resourcefulness) derived from component scores',
      not_same_as:
        'Pikud 8-component community resilience headline or validated community robustness',
      operator_visibility: 'Hidden in default UI; analyst tier only',
    },
    epistemic: {
      operator_view: 'narrative_and_evidence_not_headline_scores',
      reliability_instruments:
        'Bootstrap, entropy, and caps quantify instability and dominance; they do not validate ground-truth resilience.',
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
  if (s.pct_keyword_fallback_among_north != null) {
    line += `; north keyword_fallback=${s.pct_keyword_fallback_among_north}%`;
  }
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
