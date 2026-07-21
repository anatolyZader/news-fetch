/**
 * Real-time OOV clustering for operator alerts during assessment.
 *
 * Pipeline position: STAGE-2 assess oov path — groups unknown/open capture records
 * by semantic similarity within a rolling window and emits burst alert metadata.
 *
 * Owns: window filtering, salience bypass, source-adaptive thresholds, alert levels,
 * assessment-safe cluster serialization.
 * Does NOT: persist captures (see `oovCapture.js`) or synthesize scoring signals
 * (see `oovScoringSignals.js`).
 *
 * Key collaborators: `oov/oovClusterer.js`, `oov/oovBurstAlert.js`,
 * `contracts/learningCaptureRecordHelpers.js`.
 */

import { LEARNING_CAPTURE_KINDS } from '../../contracts/learningCaptureKinds.js';
import {
  evidenceTextForRecord,
  inferDominantSourceClass,
} from '../../contracts/learningCaptureRecordHelpers.js';
import { clusterByEmbedding, clusterByPrefix } from './oovClusterer.js';

// ---------------------------------------------------------------------------
// Salience and threshold constants
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'was', 'were', 'with', 'that', 'this', 'from',
  'have', 'has', 'had', 'not', 'but', 'they', 'their', 'reported', 'observed',
  'residents', 'people', 'community', 'during', 'after', 'before', 'into',
]);

/** Terms that lower cluster threshold (critical-stakes OOV). */
const SALIENCE_SUBSTRINGS = [
  'collapse',
  'breach',
  'mass casualt',
  'fatalit',
  'insulin',
  'medicine',
  'medication',
  'drone',
  'delivery',
  'system failure',
  'catastroph',
  'evacuat',
  'shelter fail',
  'water shortage',
  'starvation',
  'outbreak',
];

const SOURCE_CLUSTER_MIN = Object.freeze({
  field: 4,
  social: 12,
  news: 10,
  radio: 10,
  default: 5,
});

const INVESTIGATION_CAPTURE_KINDS = new Set([
  LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE,
  LEARNING_CAPTURE_KINDS.RESIDUAL_OBSERVATION,
  LEARNING_CAPTURE_KINDS.OPEN_OBSERVATION,
]);

// ---------------------------------------------------------------------------
// Window and salience helpers
// ---------------------------------------------------------------------------

/**
 * Filter capture records to a rolling time window anchored at `anchorMs`.
 * @param {Array<object>} records
 * @param {number} windowHours
 * @param {number} [anchorMs]
 * @returns {Array<object>}
 */
export function filterRecordsInWindow(records, windowHours, anchorMs = Date.now()) {
  const ms = windowHours * 60 * 60 * 1000;
  const cutoff = anchorMs - ms;
  return records.filter((r) => {
    const ts = Date.parse(r.timestamp ?? '');
    return Number.isFinite(ts) && ts >= cutoff && ts <= anchorMs + 60_000;
  });
}

/**
 * Whether evidence text contains high-salience crisis substrings.
 * @param {string} text
 * @returns {boolean}
 */
export function evidenceHasHighSalience(text) {
  const normalized = String(text ?? '').toLowerCase();
  return SALIENCE_SUBSTRINGS.some((term) => normalized.includes(term));
}

/**
 * Source-adaptive minimum cluster count for alert threshold.
 * @param {'field' | 'social' | 'news' | 'radio' | 'default'} sourceClass
 * @param {object} [opts]
 * @param {boolean} [opts.digitalDarkness]
 * @returns {number}
 */
export function clusterMinThresholdForSource(sourceClass, opts = {}) {
  const base = SOURCE_CLUSTER_MIN[sourceClass] ?? SOURCE_CLUSTER_MIN.default;
  if (opts.digitalDarkness === true) {
    return Math.max(2, base - 2);
  }
  return base;
}

/**
 * Extract top keyword tokens from cluster evidence text.
 * @param {object} cluster
 * @param {number} [max=5]
 * @returns {string[]}
 */
export function extractKeywordsFromCluster(cluster, max = 5) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const rec of cluster.records ?? []) {
    const text = evidenceTextForRecord(rec);
    for (const word of text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []) {
      if (STOP_WORDS.has(word)) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

/**
 * Strip heavy fields before serializing clusters to assessment JSON.
 * @param {object} cluster
 * @returns {object}
 */
export function serializeClusterForAssessment(cluster) {
  const { records, ...rest } = cluster;
  const dominantSource = inferDominantSourceClass(records ?? []);
  return {
    key: rest.key,
    label: rest.label ?? rest.key,
    count: rest.count,
    keywords: rest.keywords ?? [],
    high_salience: rest.high_salience === true,
    sample_evidence: rest.sample_evidence ?? [],
    distinct_sources: rest.distinct_sources ?? 0,
    distinct_articles: rest.distinct_articles ?? 0,
    related_types: rest.related_types ?? [],
    dominant_source_class: dominantSource,
  };
}

// ---------------------------------------------------------------------------
// Internal cluster annotation and alert logic
// ---------------------------------------------------------------------------

/**
 * @param {object} cluster
 */
function buildClusterLabel(cluster) {
  const keywords = extractKeywordsFromCluster(cluster, 4);
  if (keywords.length >= 2) return keywords.join(', ');
  if (cluster.sample_evidence?.[0]) {
    return String(cluster.sample_evidence[0]).slice(0, 60);
  }
  return cluster.key ?? 'unknown cluster';
}

/**
 * @param {object} cluster
 */
function annotateCluster(cluster) {
  const keywords = extractKeywordsFromCluster(cluster);
  return {
    ...cluster,
    keywords,
    label: buildClusterLabel(cluster),
    high_salience: (cluster.records ?? []).some((r) => evidenceHasHighSalience(evidenceTextForRecord(r))),
  };
}

function emptyResult(windowHours, clusteringMethod = 'none') {
  return {
    alert: false,
    level: 'none',
    total: 0,
    window_hours: windowHours,
    clustering_method: clusteringMethod,
    top_cluster_key: null,
    top_cluster_count: 0,
    top_cluster_keywords: [],
    top_clusters: [],
    salience_bypass: false,
    cluster_threshold: null,
  };
}

async function resolveUnknownClusters(unknowns, opts, embedThreshold) {
  if (typeof opts.embedFn === 'function' && unknowns.length >= 2) {
    try {
      const embeddings = await Promise.all(
        unknowns.map((rec) => opts.embedFn(evidenceTextForRecord(rec))),
      );
      return {
        clusters: clusterByEmbedding(unknowns, embeddings, embedThreshold).map(annotateCluster),
        clusteringMethod: 'embedding',
      };
    } catch {
      return {
        clusters: clusterByPrefix(unknowns).map(annotateCluster),
        clusteringMethod: 'prefix (embedding failed)',
      };
    }
  }
  return {
    clusters: clusterByPrefix(unknowns).map(annotateCluster),
    clusteringMethod: opts.embedFn ? 'prefix' : 'prefix (no embedding key)',
  };
}

function computeOovAlertLevel(unknowns, top, clusterMin, salienceBypass, operatorMin) {
  if (unknowns.length >= operatorMin) {
    return { alert: true, level: 'critical' };
  }
  if ((top?.count ?? 0) >= clusterMin) {
    return { alert: true, level: salienceBypass ? 'critical' : 'warning' };
  }
  return { alert: false, level: 'none' };
}

function parseEnvFloat(name, fallback) {
  const v = Number.parseFloat(process.env[name] ?? '');
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function parseEnvInt(name, fallback) {
  const v = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

async function evaluateClustersFromRecords(records, opts) {
  const {
    windowHours,
    embedThreshold,
    operatorMin,
    salienceMin,
    investigationMode = false,
  } = opts;

  if (records.length === 0) {
    return emptyResult(windowHours);
  }

  const { clusters, clusteringMethod } = await resolveUnknownClusters(records, opts, embedThreshold);
  const top = clusters[0] ?? null;
  const dominantSource = inferDominantSourceClass(top?.records ?? records);
  let clusterMin = clusterMinThresholdForSource(dominantSource, {
    digitalDarkness: opts.digitalDarkness === true,
  });

  const salienceBypass = clusters.some((c) => c.high_salience === true)
    || records.some((r) => evidenceHasHighSalience(evidenceTextForRecord(r)));

  if (salienceBypass) {
    clusterMin = Math.min(clusterMin, salienceMin);
  }

  const { alert, level } = computeOovAlertLevel(records, top, clusterMin, salienceBypass, operatorMin);

  const residualCount = records.filter((r) =>
    r.capture_kind === LEARNING_CAPTURE_KINDS.RESIDUAL_OBSERVATION
    || r.capture_kind === LEARNING_CAPTURE_KINDS.OPEN_OBSERVATION).length;

  const out = {
    alert,
    level,
    total: records.length,
    window_hours: windowHours,
    clustering_method: clusteringMethod,
    top_cluster_key: top?.label ?? top?.key ?? null,
    top_cluster_count: top?.count ?? 0,
    top_cluster_keywords: top?.keywords ?? [],
    top_clusters: clusters.slice(0, 5).map(serializeClusterForAssessment),
    salience_bypass: salienceBypass,
    cluster_threshold: clusterMin,
  };

  if (investigationMode) {
    out.investigation_mode = true;
    out.residual_observation_count = residualCount;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Public evaluators
// ---------------------------------------------------------------------------

/**
 * Evaluate dynamic OOV clusters for operator/scoring path (unknown_type only).
 * @param {Array<object>} records
 * @param {object} [opts]
 * @param {number} [opts.windowHours]
 * @param {number} [opts.anchorMs]
 * @param {number} [opts.operatorMin]
 * @param {number} [opts.embedThreshold]
 * @param {boolean} [opts.digitalDarkness]
 * @param {(text: string) => Promise<{ vector: Float32Array }>} [opts.embedFn]
 * @returns {Promise<object>}
 */
export async function evaluateDynamicOovClusters(records, opts = {}) {
  const windowHours = opts.windowHours ?? parseEnvFloat('RESILIENCE_OOV_CLUSTER_WINDOW_HOURS', 2);
  const embedThreshold = opts.embedThreshold ?? parseEnvFloat('RESILIENCE_OOV_EMBED_THRESHOLD', 0.82);
  const operatorMinRaw = opts.operatorMin ?? parseEnvInt('RESILIENCE_OOV_OPERATOR_MIN', 5);
  const operatorMin = Number.isFinite(operatorMinRaw) && operatorMinRaw > 0 ? operatorMinRaw : 5;
  const salienceMinRaw = parseEnvInt('RESILIENCE_OOV_SALIENCE_MIN', 2);
  const salienceMin = Number.isFinite(salienceMinRaw) && salienceMinRaw > 0 ? salienceMinRaw : 2;
  const anchorMs = opts.anchorMs ?? Date.now();

  const inWindow = filterRecordsInWindow(records, windowHours, anchorMs);
  const unknowns = inWindow.filter(
    (r) => (r.capture_kind ?? LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE) === LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE,
  );

  return evaluateClustersFromRecords(unknowns, {
    ...opts,
    windowHours,
    embedThreshold,
    operatorMin,
    salienceMin,
    anchorMs,
  });
}

/**
 * Investigation burst — includes residual/open observations for agent blackboard.
 * Scoring path should keep using `evaluateDynamicOovClusters` (unknown_type only).
 *
 * @param {Array<object>} records
 * @param {object} [opts]
 * @returns {Promise<object>}
 */
export async function evaluateInvestigationOovClusters(records, opts = {}) {
  const windowHours = opts.windowHours ?? parseEnvFloat('RESILIENCE_OOV_CLUSTER_WINDOW_HOURS', 2);
  const embedThreshold = opts.embedThreshold ?? parseEnvFloat('RESILIENCE_OOV_EMBED_THRESHOLD', 0.82);
  const operatorMinRaw = opts.operatorMin ?? parseEnvInt('RESILIENCE_OOV_OPERATOR_MIN', 5);
  const operatorMin = Number.isFinite(operatorMinRaw) && operatorMinRaw > 0 ? operatorMinRaw : 5;
  const salienceMinRaw = parseEnvInt('RESILIENCE_OOV_SALIENCE_MIN', 2);
  const salienceMin = Number.isFinite(salienceMinRaw) && salienceMinRaw > 0 ? salienceMinRaw : 2;
  const anchorMs = opts.anchorMs ?? Date.now();

  const inWindow = filterRecordsInWindow(records, windowHours, anchorMs);
  const investigationRecords = inWindow.filter((r) =>
    INVESTIGATION_CAPTURE_KINDS.has(r.capture_kind ?? LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE));

  return evaluateClustersFromRecords(investigationRecords, {
    ...opts,
    windowHours,
    embedThreshold,
    operatorMin,
    salienceMin,
    anchorMs,
    investigationMode: true,
  });
}
