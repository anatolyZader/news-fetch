/**
 * Builds immutable daily validation records for calibration / construct-validity workflows.
 */

import { CATALOG_VERSION } from '../../domain/services/signalCatalog.js';
import {
  SCORING_MODEL_VERSION,
  buildScoringModelManifest,
} from '../../domain/services/assessmentMethodology.js';
import { getCalibrationSnapshot } from '../../domain/services/signalWeightsFit.js';
import {
  computeElevationAdvisory,
  validationStatusForMethodology,
} from '../config/validationConfig.js';

/**
 * @param {object} comp
 */
function componentSnapshot(comp) {
  return {
    component_id: comp.component_id,
    system_score: comp.score ?? null,
    confidence: comp.confidence ?? null,
    certainty: comp.certainty ?? null,
    evidence_mass: comp.evidence_mass ?? null,
    polarization: comp.polarization ?? null,
    delta_score: comp.delta_score ?? null,
    delta_significance: comp.delta_significance ?? null,
    delta_flag: comp.delta_flag ?? null,
    counterfactual_delta: comp.counterfactual_delta ?? null,
    counterfactual_article_key: comp.counterfactual_article_key ?? null,
    signal_count: comp.signal_count ?? 0,
    distinct_article_count: comp.distinct_article_count ?? 0,
    top_contributors: (comp.top_contributors ?? []).slice(0, 3).map((t) => ({
      signal_type: t.signal_type,
      source_type: t.source_type,
      article_source: t.article_source,
      article_url: t.article_url,
    })),
    expert_labels: [],
    outcome_tags: [],
  };
}

/**
 * @param {object} opts
 * @param {object} opts.assessment
 * @param {Array<object>} opts.signals
 * @param {string} opts.reportJsonPath
 * @param {string[]} [opts.signalPaths]
 * @param {object} [opts.pipelineConfig]
 * @param {object} opts.validationConfig
 * @param {object} [opts.reviewQueueSummary]
 * @param {object} [opts.tuningProposal]
 */
export function buildValidationRecord({
  assessment,
  signals,
  reportJsonPath,
  signalPaths = [],
  pipelineConfig = null,
  validationConfig,
  reviewQueueSummary = null,
  tuningProposal = null,
} = {}) {
  const cfg = validationConfig ?? {};
  const phase = cfg.operational_phase ?? 'baseline';
  const signalList = Array.isArray(signals) ? signals : [];
  const elevationAdvisory = computeElevationAdvisory(
    {
      signalCount: signalList.length,
      articleCount: assessment?.total_articles_analyzed ?? 0,
    },
    cfg,
  );

  const manifest = buildScoringModelManifest();
  const calibrationSnapshot = getCalibrationSnapshot();

  return {
    schema_version: 1,
    record_type: 'daily_validation',
    date: assessment?.date ?? null,
    scope: assessment?.report_scope?.id ?? 'national',
    generated_at: new Date().toISOString(),
    operational_phase: phase,
    phase_started_at: cfg.phase_started_at ?? null,
    shadow_collection: phase === 'baseline' && cfg.collection?.shadow_in_baseline !== false,
    provenance: {
      report_json_path: reportJsonPath,
      signal_paths: [...signalPaths],
      sources_enabled: pipelineConfig?.sources ?? null,
      catalog_version: CATALOG_VERSION,
      scoring_model_version: SCORING_MODEL_VERSION,
      signal_to_components_sha256: manifest.signal_to_components_sha256,
      models: {
        extract: process.env.RESILIENCE_EXTRACT_MODEL ?? 'claude-haiku-4-5-20251001',
        narrative: process.env.RESILIENCE_NARRATIVE_MODEL ?? 'claude-sonnet-4-6',
      },
      total_signals: signalList.length,
      total_articles_analyzed: assessment?.total_articles_analyzed ?? 0,
      overall_score: assessment?.overall_resilience_score ?? null,
    },
    validation_status: validationStatusForMethodology(cfg),
    elevation_advisory: elevationAdvisory,
    components: (assessment?.components ?? []).map(componentSnapshot),
    calibration_snapshot_ref: {
      catalog_version: calibrationSnapshot.catalog_version,
      signal_count: calibrationSnapshot.signal_count,
      captured_at: new Date().toISOString(),
    },
    tuning_proposal_summary: tuningProposal
      ? {
        status: tuningProposal.status ?? 'advisory_only',
        report_count: tuningProposal.report_count ?? null,
        skipped_reason: tuningProposal.skipped_reason ?? null,
        components_with_proposal: tuningProposal.components
          ? Object.keys(tuningProposal.components).length
          : 0,
      }
      : null,
    review_queue_summary: reviewQueueSummary,
    label_slots: {
      expert_component_scores: 'append via review workflow; blind scoring preferred',
      outcome_tags: 'link delayed PBO/field/service outcomes retrospectively',
      extraction_gold: 'per review-queue item gold_signals',
    },
  };
}
