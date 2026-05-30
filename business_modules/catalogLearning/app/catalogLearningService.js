/**
 * Catalog learning — cluster OOV captures and produce analyst gap reports.
 */

import { embeddingsEnabled, embedText } from '../../../cross-cut-modules/vector_index/index.js';
import { LEARNING_CAPTURE_KINDS } from '../domain/services/learningCaptureKinds.js';
import {
  clusterByEmbedding,
  clusterByPrefix,
  rankClusters,
} from '../domain/services/oovClusterer.js';
import { formatGapReportMarkdown } from '../domain/services/gapReportFormatter.js';
import { retrieveCatalogNeighbors } from '../../../cross-cut-modules/retrieval/analystRetrieval.js';
import { catalogLearningRagEnabled } from '../../../cross-cut-modules/retrieval/ragConfig.js';

export class CatalogLearningService {
  /**
   * @param {object} deps
   * @param {import('../domain/ports/ILearningCapturePort.js').ILearningCapturePort} deps.capturePort
   */
  constructor({ capturePort }) {
    this.capturePort = capturePort;
  }

  /**
   * @param {object} [opts]
   */
  async buildGapReport(opts = {}) {
    const maxDays = opts.maxDays ?? 14;
    const topN = opts.topN ?? 15;
    const minCount = opts.minCount ?? 2;
    const embedThreshold = opts.embedThreshold ?? 0.82;

    const { records, files } = await this.capturePort.loadCaptureRecords({ maxDays });
    const kindCounts = countByKind(records);

    let clusters;
    let clusteringMethod;
    if (embeddingsEnabled() && records.length >= 3) {
      try {
        const embeddings = await Promise.all(
          records.map((rec) => embedText(
            rec.evidence ?? rec.snippet ?? rec.behavioral_description ?? rec.suggested_type ?? '',
          )),
        );
        clusters = clusterByEmbedding(records, embeddings, embedThreshold);
        clusteringMethod = `embedding (threshold=${embedThreshold})`;
      } catch {
        clusters = clusterByPrefix(records);
        clusteringMethod = 'prefix (embedding failed)';
      }
    } else {
      clusters = clusterByPrefix(records);
      clusteringMethod = embeddingsEnabled() ? 'prefix' : 'prefix (no embedding key)';
    }

    const ranked = rankClusters(clusters, { minCount }).slice(0, topN);

    if (catalogLearningRagEnabled() && opts.retrieval?.hybridRetrieve) {
      for (const cluster of ranked) {
        const sample = cluster.sample_evidence?.[0] ?? cluster.key ?? '';
        const { nearest_catalog, counterexamples } = await retrieveCatalogNeighbors(
          sample,
          opts.retrieval,
        );
        cluster.nearest_catalog = nearest_catalog;
        cluster.counterexamples = counterexamples;
      }
    }

    return {
      generated_at: new Date().toISOString(),
      file_count: files.length,
      total_records: records.length,
      kind_counts: kindCounts,
      clustering_method: clusteringMethod,
      clusters: ranked,
    };
  }

  /**
   * @param {object} [opts]
   */
  async generateGapReportMarkdown(opts = {}) {
    const report = await this.buildGapReport(opts);
    return formatGapReportMarkdown(report);
  }
}

/**
 * @param {Array<object>} records
 */
function countByKind(records) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const rec of records) {
    const kind = rec.capture_kind ?? LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE;
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}
