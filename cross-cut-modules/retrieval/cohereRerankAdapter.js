/**
 * Cohere Rerank API adapter for post-retrieval ranking.
 */
import { cohereApiKey, cohereRerankModel, cohereRerankEnabled } from './ragConfig.js';
import { calcRerankCostUsd } from '../budget/app/budgetCostTracker.js';

let warnedNoKey = false;

/**
 * @param {string} query
 * @param {Array<{ chunkId: string, text: string }>} documents
 * @param {{ topN?: number, onUsage?: (p: { model?: string, costUsd?: number }) => void }} [opts]
 * @returns {Promise<Array<{ chunkId: string, relevanceScore: number, index: number }>>}
 */
export async function cohereRerank(query, documents, opts = {}) {
  if (!cohereRerankEnabled()) {
    if (!warnedNoKey) {
      warnedNoKey = true;
      console.error('rag: COHERE_API_KEY not set — skipping rerank (using RRF order)');
    }
    return documents.map((d, index) => ({
      chunkId: d.chunkId,
      relevanceScore: 1 - index * 0.01,
      index,
    }));
  }

  const topN = Math.min(documents.length, opts.topN ?? documents.length);
  if (!documents.length || !String(query ?? '').trim()) return [];

  const { CohereClient } = await import('cohere-ai');
  const client = new CohereClient({ token: cohereApiKey() });

  const response = await client.rerank({
    model: cohereRerankModel(),
    query: String(query).trim(),
    documents: documents.map((d) => String(d.text ?? '').slice(0, 4000)),
    topN,
  });

  const model = cohereRerankModel();
  if (opts.onUsage) {
    opts.onUsage({
      model,
      costUsd: calcRerankCostUsd(model, { documentCount: documents.length }),
    });
  }

  const results = response?.results ?? [];
  return results.map((r) => ({
    chunkId: documents[r.index]?.chunkId ?? '',
    relevanceScore: r.relevanceScore ?? 0,
    index: r.index,
  })).filter((r) => r.chunkId);
}
