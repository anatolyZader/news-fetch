/**
 * Assessment methodology metadata for auditors and user-facing copy.
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
import { extractionTelemetryForUser } from '../services/pipeline/pipelineStageTelemetry.js';
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
export const SCORING_MODEL_VERSION = 'v12';

/**
 * Human-maintained changelog paired with SCORING_MODEL_VERSION.
 * Newest first. Required when bumping the version.
 */
export const SCORING_MODEL_CHANGELOG = [
  {
    version: 'v12',
    date: '2026-08-15',
    summary:
      'Signal-quality epoch, from the /review-signals audit of north 2026-04-02 (CATALOG_VERSION v9 → v10, so the extraction cache is invalidated; EXTRACT_PROMPT_VERSION deliberately stays extract-v5 — no prompt text changed, only catalog labels, and the version pin doubles as the guard that the hard-budgeted stable prefix was not touched). Six changes, four of which break report comparability. (1) Grounding: evidence carrying an extractor translation gloss is now retried against a gloss-stripped candidate before demotion, non-destructively — all 59 visits signals in the audited report carried one and 13 were ungrounded, 11 of them recoverable. Verbatim-contract breaches (gloss, English-only evidence against a Hebrew source, ` + ` span concatenation, `...` elision) are counted into verifier telemetry instead of being silently absorbed by cross-lingual entailment. Kill switch RESILIENCE_GLOSS_STRIP_VERIFY. Rescued signals are concentrated in protection vocabulary (protective_infrastructure_absent, early_warning_system_failure), so components can newly trip presence gates on evidence that was always there. (2) News event collapse: one real-world event reported by several outlets is merged on signal_type + resolved geo locality + date, the survivor taking the BEST grounding tier in the group — the same Kiryat Shmona casualty fact was graded grounded by two outlets and unverified_critical by two others. Runs after geo enrichment; the existing story-cluster pass only catches near-paraphrases at 0.93 and left all 11 news signals as singletons. distinct_article_count drops where outlets were double-counted; corroboration survives as _event_outlet_count. Kill switch RESILIENCE_EVENT_DEDUP. (3) Presence gates now require a primary routing edge, in both the auto-generated rule table and at evaluation, and salient_single_signal reads primary-only too: leadership loses its critical_failure flag, which fired off an inferred edge from a single locality on evidence invisible in its own top_contributors. Two dead hand-rule entries removed (protective_infra_absent and plan_failed_functional both named functional_continuity, which neither type routes to) and a routing-coherence guard added so this cannot recur. The triggering signal is now pinned into top_contributors. PRESENCE_GATE_VERSION 2026-08-v2. (4) concentration_warning no longer goes silent when a single key holds 100% of a component — the worst case was the unreported one; components at total concentration now downgrade confidence where they previously read high. New sibling field source_class_exposure measures what outlet share cannot: independent vs self-reported evidence, and whether the PBO author IS the assessed object (leadership, information_communication). The self-assessment arm downgrades confidence; the no-independent-corroboration arm is measured but OFF pending RESILIENCE_INDEPENDENCE_DOWNGRADE. (5) pbo_review_state is re-resolved at assess time through an injected port instead of being frozen at extract time — it was structurally always "unreviewed", because reviews are written after extraction, which meant THIN_REVIEW_SHARE could never fire. incomplete_share is now null rather than 0 when nothing was reviewed, so an absence of data stops reading as a clean bill of health. Kill switch RESILIENCE_ASSESS_PBO_REVIEW. (6) Catalog labels re-scoped on four confusion pairs the spot-check sample kept failing (2 correct / 5 marginal / 1 misclassified, every error on one of two axes): wellbeing_support_provided vs _accessed and community_volunteering vs resource_mobilization now state provider-vs-recipient as a syntactic test on the sentence subject; information_clarity vs information_actionable_effective and inter_group_trust vs solidarity_help_others separate capability from observed effect and state from act. Labels only — the disambiguation block is inside the 8100-char stable prefix, which has 5 chars of headroom and is unchanged. Extraction classifications are not comparable pre/post. Nothing was re-extracted or re-assessed: every change applies to future runs, and persisted reports are untouched.',
  },
  {
    version: 'v11',
    date: '2026-08-08',
    summary:
      'Evidence-surface epoch (CATALOG_VERSION v8 → v9, so the extraction cache is invalidated; EXTRACT_PROMPT_VERSION separately bumped extract-v4 → v5 for a verbatim-evidence rule). Three new catalog types: vulnerable_population_mapping (construct_role institutional_state, + primary into wellbeing_at_risk), wellbeing_support_provided (split from wellbeing_support_accessed, which had stretched to cover "the welfare department is operating"; routes identically, no wellbeing edge), out_group_blaming (- primary into belonging_solidarity, closing GQ3 which previously had no instrument at all). conflict_or_tension narrowed to reciprocal friction — "scapegoating" moved to out_group_blaming. The institutional_state carve-out is deliberate and does not weaken the v7 response/capacity rule: that rule bars treatment uptake as proxy evidence of wellbeing, whereas wellbeing_at_risk is defined as "the ability to identify and address the needs of vulnerable populations" with GQ1/GQ3 asking for exactly the mapping and monitoring mechanisms this type describes — constitutive evidence, not proxy. Comparability breaks: wellbeing_at_risk gains its first structural positives (previously 2 positive / 47 negative by routing construction, both misclassified); community_capital sheds provision-only signals to the new type; belonging_solidarity gains othering evidence. Surface changes in the same epoch: contributor ranking no longer degenerates to article order, and demoted (weak / unverified_critical) evidence is now reported per component instead of dropped. signal_refs are not comparable pre/post — slimSignal now carries article_url/article_index, so buildRefKey stops collapsing every signal in a component onto one key.',
  },
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

/** User-facing note on how signal.district_id and source_type interact with report scope. */
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
 * Full on-disk scoring-model manifest (developer audit): includes the full
 * SIGNAL_TO_COMPONENTS edge table and a sha256 of its JSON.
 * Not exposed on the user API tier (strip via methodologyForUserView).
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
  loadHygiene = null,
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
      ...(loadHygiene?.total > 0 ? { load_hygiene: loadHygiene } : {}),
      ...(Array.isArray(signals) && signals.some((s) => s && 'geo' in s)
        ? { geo_quality_summary: summarizeGeoQuality(signals) }
        : {}),
    },
    governance: {
      weights_steward: 'developer_and_product_review',
      weights_change_process:
        'Edits to SIGNAL_TO_COMPONENTS require bumping scoring_model_version and an entry in SCORING_MODEL_CHANGELOG (assessmentMethodology.js).',
      headline_scores_are:
        'Deterministic model outputs for triage and narrative context—not policy directives or legal findings.',
      user_accountability:
        'Public-facing layer: behavioral narratives and cited evidence. Numeric scores are internal/developer tooling unless explicitly enabled.',
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

// --- User view & CLI logging ---

/**
 * User-safe methodology: drops full weight matrix; redacts tuning and
 * extraction telemetry to summary fields only.
 * @param {object | null | undefined} methodology
 * @returns {object | null | undefined}
 */
export function methodologyForUserView(methodology) {
  if (!methodology || typeof methodology !== 'object') return methodology;
  const out = { ...methodology };
  delete out.scoring_model;
  if (out.limitations?.extraction_pipeline_stages) {
    out.limitations = {
      ...out.limitations,
      extraction_pipeline_stages: extractionTelemetryForUser(
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
