/**
 * Catalog proposal service — human-in-the-loop OOV draft proposals.
 */
import { CatalogLearningService } from './catalogLearningService.js';
import { LearningCaptureFsAdapter } from '../infrastructure/adapters/learningCaptureFsAdapter.js';
import { buildDraftProposalFromCluster } from '../domain/services/draftProposalBuilder.js';
import { generateCatalogProposalFields } from '../infrastructure/adapters/anthropicCatalogProposalAdapter.js';
import { catalogLearningRagEnabled } from '../../../cross-cut-modules/retrieval/ragConfig.js';

/**
 * @param {{
 *   proposalStore: import('../domain/ports/ICatalogProposalPort.js').ICatalogProposalPort,
 *   capturePort?: object,
 *   retrievalService?: object|null,
 * }} deps
 */
export function createCatalogProposalService(deps) {
  const { proposalStore, capturePort, retrievalService = null } = deps;
  if (!proposalStore) throw new Error('proposalStore is required');

  const capture = capturePort ?? new LearningCaptureFsAdapter();
  const catalogLearning = new CatalogLearningService({ capturePort: capture });

  return {
    async getGapSummary(opts = {}) {
      const maxDays = opts.maxDays ?? opts.max_days ?? 14;
      const topN = opts.topN ?? opts.top_n ?? 10;
      const report = await catalogLearning.buildGapReport({
        maxDays,
        topN,
        retrieval: retrievalService?.retrieval && catalogLearningRagEnabled()
          ? retrievalService.retrieval
          : null,
      });
      return {
        max_days: maxDays,
        total_records: report.total_records,
        kind_counts: report.kind_counts,
        clusters: (report.clusters ?? []).slice(0, topN),
      };
    },

    async listProposals(opts = {}) {
      return proposalStore.list({
        status: opts.status ?? 'draft',
        limit: opts.limit ?? 20,
      });
    },

    getProposal(id) {
      return proposalStore.getById(id);
    },

    async generateProposals(opts = {}) {
      const maxDays = opts.maxDays ?? 14;
      const topN = opts.topN ?? 15;
      const report = await catalogLearning.buildGapReport({
        maxDays,
        topN,
        retrieval: retrievalService?.retrieval && catalogLearningRagEnabled()
          ? retrievalService.retrieval
          : null,
      });
      const ids = [];
      for (const cluster of report.clusters ?? []) {
        const llmFields = await generateCatalogProposalFields(cluster);
        const proposalJson = buildDraftProposalFromCluster(cluster, llmFields);
        const id = proposalStore.upsertDraft({
          clusterKey: cluster.key,
          proposalJson,
        });
        ids.push(id);
      }
      return { generated: ids.length, ids, report_summary: {
        total_records: report.total_records,
        clustering_method: report.clustering_method,
      } };
    },

    async reviewProposal(id, { status, note, reviewer }) {
      const existing = proposalStore.getById(id);
      if (!existing) throw new Error('Proposal not found');
      if (existing.status !== 'draft') {
        throw new Error(`Proposal already reviewed: ${existing.status}`);
      }
      return proposalStore.updateReview(id, { status, reviewer, note });
    },
  };
}
