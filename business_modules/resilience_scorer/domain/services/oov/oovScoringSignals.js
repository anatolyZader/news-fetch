/**
 * Synthesize low-weight signals from OOV cluster alerts (opt-in).
 *
 * Pipeline position: STAGE-2 assess — maps burst/cluster output to synthetic
 * `novel_behavior_observed` signals with a weight discount (not headline scores).
 *
 * Owns: env gates, cluster-to-signal mapping, extraction confidence from counts.
 * Does NOT: cluster captures (see `dynamicOovCluster.js`) or compute component
 * evidence mass (min-math).
 *
 * Key collaborators: `oov/oovBurstAlert.js`, `contracts/learningCaptureRecordHelpers.js`,
 * evidence pipeline prep.
 */

import { inferDominantSourceClass } from '../../contracts/learningCaptureRecordHelpers.js';

const DEFAULT_OOV_WEIGHT = 0.4;
const MAX_SYNTHETIC_CLUSTERS = 5;

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

/**
 * Whether OOV synthetic scoring is enabled (`RESILIENCE_OOV_SCORING` defaults on).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isOovScoringEnabled(env = process.env) {
  return env.RESILIENCE_OOV_SCORING !== '0';
}

/**
 * Weight discount for synthetic OOV signals (0–1).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number}
 */
export function oovScoreWeight(env = process.env) {
  const v = Number.parseFloat(env.RESILIENCE_OOV_SCORE_WEIGHT ?? String(DEFAULT_OOV_WEIGHT));
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : DEFAULT_OOV_WEIGHT;
}

// ---------------------------------------------------------------------------
// Internal mapping helpers
// ---------------------------------------------------------------------------

/**
 * Map density class to source_type for synthetic signals.
 * @param {'field' | 'social' | 'news' | 'radio' | 'default'} cls
 * @returns {string}
 */
function sourceTypeForClass(cls) {
  if (cls === 'social') return 'social';
  if (cls === 'news') return 'news';
  if (cls === 'radio') return 'radio';
  if (cls === 'field') return 'field';
  return 'news';
}

/**
 * Derive extraction confidence from cluster count (capped, count-based).
 * @param {number} count
 * @returns {number}
 */
function confidenceForClusterCount(count) {
  const n = Number.isFinite(count) ? count : 1;
  return Math.min(0.55, Math.max(0.35, 0.3 + n * 0.025));
}

// ---------------------------------------------------------------------------
// Signal synthesis
// ---------------------------------------------------------------------------

/**
 * Build synthetic scoring signals from an OOV burst evaluation result.
 * @param {object|null|undefined} oovBurst
 * @param {object} [opts]
 * @param {string} [opts.reportDate]
 * @param {string} [opts.reportScopeId]
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @returns {{ signals: Array<object>, applied: object|null }}
 */
export function synthesizeOovScoringSignals(oovBurst, opts = {}) {
  if (!isOovScoringEnabled(opts.env)) {
    return { signals: [], applied: null };
  }
  if (!oovBurst?.alert || !Array.isArray(oovBurst.top_clusters) || oovBurst.top_clusters.length === 0) {
    return { signals: [], applied: null };
  }

  const weightDiscount = oovScoreWeight(opts.env);
  const clusters = oovBurst.top_clusters.slice(0, MAX_SYNTHETIC_CLUSTERS);
  /** @type {Array<object>} */
  const signals = [];
  /** @type {string[]} */
  const clustersScored = [];

  for (const cluster of clusters) {
    const count = cluster.count ?? 0;
    const minForCluster = oovBurst.cluster_threshold ?? 3;
    if (count < minForCluster && !(oovBurst.salience_bypass && cluster.high_salience)) {
      continue;
    }

    const label = cluster.label ?? cluster.key ?? 'novel behavior cluster';
    const sample = Array.isArray(cluster.sample_evidence) ? cluster.sample_evidence[0] : null;
    const evidence = sample
      ? `${label}: ${String(sample).slice(0, 200)}`
      : label;
    const key = cluster.key ?? cluster.label ?? `oov-${signals.length + 1}`;
    const sourceClass = cluster.dominant_source_class
      ?? inferDominantSourceClass(cluster.records ?? []);

    signals.push({
      signal_type: 'novel_behavior_observed',
      source_type: sourceTypeForClass(sourceClass),
      evidence_type: 'observational_reported_fact',
      scope_level: 'repeated_pattern',
      evidence,
      extraction_confidence: confidenceForClusterCount(count),
      temporal_weight: 1,
      oov_synthetic: true,
      oov_cluster_key: key,
      oov_cluster_count: count,
      oov_score_weight: weightDiscount,
      metricsEligible: true,
      article_source: `oov-cluster:${key}`,
      article_index: 9000 + signals.length,
    });
    clustersScored.push(key);
  }

  if (signals.length === 0) {
    return { signals: [], applied: null };
  }

  return {
    signals,
    applied: {
      synthetic_count: signals.length,
      clusters_scored: clustersScored,
      weight_discount: weightDiscount,
    },
  };
}
