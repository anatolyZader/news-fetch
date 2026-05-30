/**
 * Historical PBO search via archive RAG.
 */
import { retrievePboHistory } from '../../../cross-cut-modules/retrieval/analystRetrieval.js';
import { pboReviewRagEnabled } from '../../../cross-cut-modules/retrieval/ragConfig.js';

/**
 * @param {{ retrievalService?: object|null }} deps
 */
export function createPboHistoricalSearchService(deps = {}) {
  const retrieval = deps.retrievalService?.retrieval ?? null;

  return {
    enabled: pboReviewRagEnabled,

    async search(input) {
      if (!pboReviewRagEnabled() || !retrieval) {
        return { hits: [], enabled: false };
      }
      const hits = await retrievePboHistory(String(input?.query ?? ''), {
        retrieval,
        districtId: input?.district ?? input?.districtId ?? null,
        municipality: input?.municipality ?? null,
        regionId: input?.region ?? input?.regionId ?? null,
        reportDate: input?.date ?? new Date().toISOString().slice(0, 10),
        days: input?.days,
        topK: input?.limit ?? 8,
      });
      return { hits, enabled: true, query: input?.query };
    },
  };
}
