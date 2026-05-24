/**
 * Cluster learning-capture records for catalog-gap review.
 */

import {
  clusterKeyForRecord,
  evidenceTextForRecord,
  LEARNING_CAPTURE_KINDS,
} from './learningCaptureKinds.js';

/**
 * @param {Float32Array|number[]} a
 * @param {Float32Array|number[]} b
 */
export function cosineSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Prefix-based fallback clustering when embeddings are unavailable.
 * @param {Array<object>} records
 */
export function clusterByPrefix(records) {
  /** @type {Map<string, { key: string, records: object[], kinds: Map<string, number> }>} */
  const clusters = new Map();

  for (const rec of records) {
    const key = clusterKeyForRecord(rec).toLowerCase().slice(0, 60);
    const bucket = clusters.get(key) ?? { key, records: [], kinds: new Map() };
    bucket.records.push(rec);
    const kind = rec.capture_kind ?? LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE;
    bucket.kinds.set(kind, (bucket.kinds.get(kind) ?? 0) + 1);
    clusters.set(key, bucket);
  }

  return [...clusters.values()]
    .map((c) => summarizeCluster(c.key, c.records, c.kinds))
    .sort((a, b) => b.count - a.count);
}

/**
 * Greedy embedding clustering — merges records above similarity threshold.
 * @param {Array<object>} records
 * @param {Array<{ vector: Float32Array }>} embeddings
 * @param {number} threshold
 */
export function clusterByEmbedding(records, embeddings, threshold = 0.82) {
  /** @type {Array<{ centroid: Float32Array, records: object[] }>} */
  const clusters = [];

  for (let i = 0; i < records.length; i++) {
    const vec = embeddings[i]?.vector;
    if (!vec) continue;
    let merged = false;
    for (const cluster of clusters) {
      if (cosineSimilarity(vec, cluster.centroid) >= threshold) {
        cluster.records.push(records[i]);
        merged = true;
        break;
      }
    }
    if (!merged) {
      clusters.push({ centroid: vec, records: [records[i]] });
    }
  }

  return clusters
    .map((c, idx) => {
      const kinds = new Map();
      for (const rec of c.records) {
        const kind = rec.capture_kind ?? LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE;
        kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
      }
      return summarizeCluster(`cluster-${idx + 1}`, c.records, kinds);
    })
    .sort((a, b) => b.count - a.count);
}

/**
 * @param {string} key
 * @param {Array<object>} records
 * @param {Map<string, number>} kinds
 */
function summarizeCluster(key, records, kinds) {
  const sampleEvidence = records
    .map(evidenceTextForRecord)
    .filter(Boolean)
    .slice(0, 3);
  const sourceLabels = new Set(records.map((r) => r.source_label).filter(Boolean));
  const articleUrls = new Set(records.map((r) => r.article_url).filter(Boolean));
  const signalTypes = new Set(
    records.flatMap((r) => [
      r.signal_type,
      r.suggested_type,
      ...(Array.isArray(r.nearest_existing_types) ? r.nearest_existing_types : []),
    ]).filter(Boolean),
  );
  const noveltyHints = records
    .map((r) => r.novelty_hint)
    .filter((h) => h === 'high' || h === 'medium');

  return {
    key,
    count: records.length,
    kinds: Object.fromEntries(kinds),
    sample_evidence: sampleEvidence,
    distinct_sources: sourceLabels.size,
    distinct_articles: articleUrls.size || new Set(records.map((r) => r.article_index)).size,
    related_types: [...signalTypes].slice(0, 8),
    high_novelty_count: noveltyHints.filter((h) => h === 'high').length,
    medium_novelty_count: noveltyHints.filter((h) => h === 'medium').length,
    records,
  };
}

/**
 * Rank clusters for analyst attention.
 * @param {Array<object>} clusters
 * @param {object} [opts]
 */
export function rankClusters(clusters, opts = {}) {
  const minCount = opts.minCount ?? 2;
  return clusters
    .filter((c) => c.count >= minCount || c.high_novelty_count > 0)
    .map((c) => ({
      ...c,
      priority_score:
        c.count * 2
        + c.distinct_sources * 3
        + c.high_novelty_count * 5
        + c.medium_novelty_count * 2
        + (c.kinds[LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE] ?? 0) * 2
        + (c.kinds[LEARNING_CAPTURE_KINDS.RESIDUAL_OBSERVATION] ?? 0) * 3,
    }))
    .sort((a, b) => b.priority_score - a.priority_score);
}
