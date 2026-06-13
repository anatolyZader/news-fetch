/**
 * Catalog proposal service — human-in-the-loop OOV draft proposals.
 */
import { SignalCatalogEvolutionService } from './signalCatalogEvolutionService.js';
import { createDefaultLearningCapturePort } from '../infrastructure/createLearningCapturePort.js';
import { buildDraftProposalFromCluster } from '../domain/services/draftProposalBuilder.js';
import { generateCatalogProposalFields } from '../infrastructure/adapters/anthropicCatalogProposalAdapter.js';
import { signalCatalogEvolutionRagEnabled } from '../../../cross-cut-modules/retrieval/ragConfig.js';
import { clusterByPrefix } from '../domain/services/oovClusterer.js';
import {
  LEARNING_CAPTURE_KINDS,
  evidenceTextForRecord,
} from '../domain/services/learningCaptureKinds.js';

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

  const capture = capturePort ?? createDefaultLearningCapturePort();
  const signalCatalogEvolution = new SignalCatalogEvolutionService({ capturePort: capture });

  return {
    async getGapSummary(opts = {}) {
      const maxDays = opts.maxDays ?? opts.max_days ?? 14;
      const topN = opts.topN ?? opts.top_n ?? 10;
      const report = await signalCatalogEvolution.buildGapReport({
        maxDays,
        topN,
        retrieval: retrievalService?.retrieval && signalCatalogEvolutionRagEnabled()
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
      const report = await signalCatalogEvolution.buildGapReport({
        maxDays,
        topN,
        retrieval: retrievalService?.retrieval && signalCatalogEvolutionRagEnabled()
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

    async generateProposalsFromVerifiedOpen(opts = {}) {
      const maxDays = opts.maxDays ?? 14;
      const minRecurrence = opts.minRecurrence ?? 3;
      const { records } = await capture.loadCaptureRecords({ maxDays });
      const verified = records.filter(
        (r) => r.capture_kind === LEARNING_CAPTURE_KINDS.VERIFIED_OPEN_OBSERVATION,
      );
      if (verified.length < minRecurrence) {
        return { generated: 0, ids: [], verified_records: verified.length };
      }

      const clusters = clusterByPrefix(verified)
        .filter((c) => c.count >= minRecurrence)
        .map((c) => ({
          ...c,
          key: `${c.key}:${c.records?.[0]?.component_id ?? 'narrative'}`,
        }));

      const ids = [];
      for (const cluster of clusters) {
        const llmFields = await generateCatalogProposalFields(cluster);
        const proposalJson = buildDraftProposalFromCluster(cluster, llmFields);
        const id = proposalStore.upsertDraft({
          clusterKey: cluster.key,
          proposalJson: {
            ...proposalJson,
            source_kind: LEARNING_CAPTURE_KINDS.VERIFIED_OPEN_OBSERVATION,
            sample_evidence: cluster.sample_evidence?.[0] ?? evidenceTextForRecord(cluster.records?.[0] ?? {}),
          },
        });
        ids.push(id);
      }
      return { generated: ids.length, ids, verified_records: verified.length };
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
