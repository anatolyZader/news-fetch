/**
 * RAG retrieval orchestrator: rewrite → hybrid → rerank → format.
 */
import { embedText, embeddingsEnabled } from '../vector_index/index.js';
import { reciprocalRankFusion } from './hybridSearch.js';
import { cohereRerank } from './cohereRerankAdapter.js';
import { rewriteQueryForRetrieval } from './queryRewriter.js';
import {
  ragPipelineEnabled,
  chatRagHintsEnabled,
  chatArchiveRagEnabled,
  ragRetrievalDays,
  ragHybridCandidates,
  ragFinalTopK,
  ragRrfK,
  ragContextSnippetChars,
} from './ragConfig.js';
import { getTodayInTimezone } from '../../utils/dateUtils.js';

function dateWindowEnd(reportDate, timezone) {
  const d = String(reportDate ?? '').trim();
  if (d) return d;
  return getTodayInTimezone(timezone ?? 'Asia/Jerusalem');
}

function dateWindowStart(endDate, days) {
  const d = new Date(`${endDate}T12:00:00`);
  d.setDate(d.getDate() - Math.max(0, days - 1));
  return d.toISOString().slice(0, 10);
}

function clipSnippet(text, maxChars) {
  const s = String(text ?? '').replaceAll(/\s+/g, ' ').trim();
  const n = maxChars ?? 800;
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

async function embedQueryVector(query) {
  if (!embeddingsEnabled()) return null;
  try {
    const emb = await embedText(query);
    return emb.vector;
  } catch (err) {
    console.error('rag retrieve: embed query failed:', err.message);
    return null;
  }
}

function fuseNamespaceHits(chunkStore, namespace, searchCtx) {
  const { q, queryVector, perNs, dateFrom, dateTo, filters, scopeId } = searchCtx;
  let denseHits = [];
  if (queryVector) {
    denseHits = chunkStore.denseSearch({
      namespace,
      dateFrom,
      dateTo,
      sourceType: filters.sourceType ?? null,
      queryVector,
      topK: perNs,
      minSim: 0.1,
    });
  }
  const ftsHits = chunkStore.ftsSearch({
    namespace,
    dateFrom,
    dateTo,
    query: q,
    sourceType: filters.sourceType ?? null,
    topK: perNs,
  });
  let fused = reciprocalRankFusion(denseHits, ftsHits, { k: ragRrfK(), topK: perNs });
  if (scopeId && namespace === 'report') {
    fused = fused.filter((f) => !f.hit.scopeId || f.hit.scopeId === scopeId);
  }
  return fused;
}

function hitsWithoutRerank(pool, topK) {
  return pool.slice(0, topK).map((f) => ({
    ...f.hit,
    chunkId: f.chunkId,
    rrfScore: f.rrfScore,
  }));
}

async function hitsWithRerank(pool, q, topK) {
  const docs = pool.map((f) => ({
    chunkId: f.chunkId,
    text: String(f.hit?.text ?? '').slice(0, 4000),
  }));
  const reranked = await cohereRerank(q, docs, { topN: topK });
  const byId = new Map(pool.map((f) => [f.chunkId, f]));
  return reranked.map((r) => {
    const f = byId.get(r.chunkId);
    return {
      ...f?.hit,
      chunkId: r.chunkId,
      rrfScore: f?.rrfScore,
      relevanceScore: r.relevanceScore,
    };
  }).filter((h) => h.chunkId);
}

function applyRetrievalHitFilters(hits, filters) {
  let filtered = hits;
  if (filters.parentId) {
    const pid = String(filters.parentId).trim();
    const scoped = filtered.filter((h) => (h.parentId ?? '') === pid);
    if (scoped.length) filtered = scoped;
  }
  const sourceTypes = filters.sourceTypes;
  if (Array.isArray(sourceTypes) && sourceTypes.length > 0) {
    const allowed = new Set(sourceTypes.map((t) => String(t).trim()).filter(Boolean));
    filtered = filtered.filter((h) => allowed.has(String(h.sourceType ?? '')));
  }
  if (filters.scopeId) {
    const sid = String(filters.scopeId).trim();
    filtered = filtered.filter((h) => !h.scopeId || h.scopeId === sid);
  }
  return filtered;
}

/**
 * @param {ReturnType<import('./chunkStore.js').createChunkStore>} chunkStore
 * @param {ReturnType<import('./indexWriter.js').createIndexWriter>} indexWriter
 * @param {{ timezone?: string }} [opts]
 */
export function createRetrievalOrchestrator(chunkStore, indexWriter, opts = {}) {
  const timezone = opts.timezone ?? process.env.TZ_ARTICLES ?? 'Asia/Jerusalem';

  async function hybridRetrieve(query, filters) {
    const q = String(query ?? '').trim();
    if (!q) return [];

    const namespaces = filters.namespaces ?? ['archive', 'report'];
    const dateTo = filters.dateTo ?? dateWindowEnd(filters.reportDate, timezone);
    const dateFrom = filters.dateFrom ?? dateWindowStart(dateTo, filters.dateWindowDays ?? ragRetrievalDays());
    const candidates = filters.candidatePool ?? ragHybridCandidates();
    const scopeId = filters.scopeId ?? null;
    const queryVector = await embedQueryVector(q);
    const perNs = Math.ceil(candidates / namespaces.length);
    const searchCtx = { q, queryVector, perNs, dateFrom, dateTo, filters, scopeId };

    const fusedAll = namespaces.flatMap((namespace) => fuseNamespaceHits(chunkStore, namespace, searchCtx));
    fusedAll.sort((a, b) => b.rrfScore - a.rrfScore);
    const pool = fusedAll.slice(0, candidates);

    const topK = filters.topKFinal ?? ragFinalTopK();
    let hits = filters.skipRerank
      ? hitsWithoutRerank(pool, topK)
      : await hitsWithRerank(pool, q, topK);
    hits = applyRetrievalHitFilters(hits, filters);
    return hits.slice(0, topK);
  }

  return {
    enabled: ragPipelineEnabled,
    hybridRetrieve,

    listArchiveChunksByParent(parentId) {
      return chunkStore.listChunksByParent('archive', parentId);
    },

    async rewriteQuery(input) {
      return rewriteQueryForRetrieval(input);
    },

    async retrieve(input) {
      if (!ragPipelineEnabled()) return [];
      const query = String(input?.query ?? input?.message ?? '').trim();
      if (!query) return [];

      const reportDate = input?.reportData?.assessment?.date ?? input?.reportData?.reportDate;
      const scopeId = input?.reportGeoScope === 'north' ? 'north' : 'national';

      const namespaces = [];
      if (chatArchiveRagEnabled()) namespaces.push('archive');
      namespaces.push('report');

      return hybridRetrieve(query, {
        namespaces,
        reportDate,
        dateWindowDays: input?.dateWindowDays ?? ragRetrievalDays(),
        scopeId,
        sourceType: input?.sourceType ?? null,
        topKFinal: input?.topKFinal ?? ragFinalTopK(),
      });
    },

    /**
     * Build system-context retrieval block for chat.
     */
    async buildChatRetrievalHint(input) {
      if (!ragPipelineEnabled() || !chatRagHintsEnabled()) return '';

      const message = String(input?.message ?? '').trim();
      const history = input?.history ?? [];
      const systemHint = input?.systemHint ?? '';
      const reportData = input?.reportData;

      if (reportData?.assessment && input?.indexWriterHelpers) {
        try {
          await indexWriter.indexReport(reportData, input.indexWriterHelpers);
        } catch (err) {
          console.error('rag indexReport:', err.message);
        }
      }

      const rewritten = await rewriteQueryForRetrieval({ message, history, systemHint });
      const hits = await this.retrieve({
        query: rewritten,
        reportData,
        reportGeoScope: input?.reportGeoScope,
        dateWindowDays: input?.dateWindowDays,
      });

      if (!hits.length) return '';

      const snippetChars = ragContextSnippetChars();
      const lines = hits.map((h, i) => {
        const parent = h.parentId ?? h.chunkId;
        const title = h.title ? ` title="${clipSnippet(h.title, 80)}"` : '';
        const url = h.sourceUrl ? `\n    url: ${h.sourceUrl}` : '';
        const score = h.relevanceScore == null
          ? `rrf=${(h.rrfScore ?? 0).toFixed(4)}`
          : `relevance=${h.relevanceScore.toFixed(3)}`;
        return (
          `[${i + 1}] source_id=${parent} chunk=c${h.chunkIndex ?? 0} (${h.kind ?? 'chunk'}, ${score})${title}\n` +
          `    ${clipSnippet(h.text, snippetChars)}${url}`
        );
      }).join('\n');

      return (
        `RETRIEVED CONTEXT (hybrid search + rerank; cite source_id; use get_source for full text):\n` +
        `${lines}\n\n` +
        `Search query used: ${rewritten}`
      );
    },

    /**
     * Unified search for search_sources tool — dedupe by parent_id.
     */
    async searchArchiveChunks(input) {
      if (!ragPipelineEnabled()) return null;
      const query = String(input?.query ?? '').trim();
      if (!query) return null;

      const date = String(input?.date ?? input?.date_from ?? '').trim();
      const dateTo = String(input?.date_to ?? date).trim();
      if (!date) return null;

      const hits = await hybridRetrieve(query, {
        namespaces: ['archive'],
        dateFrom: date,
        dateTo,
        reportDate: dateTo,
        dateWindowDays: 1,
        sourceType: input?.source_type ?? null,
        candidatePool: Math.min(40, input?.limit ? input.limit * 4 : 28),
        topKFinal: Math.min(25, input?.limit ? input.limit * 2 : 14),
      });

      const byParent = new Map();
      for (const h of hits) {
        const pid = h.parentId ?? h.chunkId;
        if (!byParent.has(pid)) {
          byParent.set(pid, {
            source_id: pid,
            title: h.title,
            url: h.sourceUrl,
            source_type: h.sourceType,
            published_at: null,
            snippet: clipSnippet(h.text, input?.snippet_chars ?? 350),
          });
        }
      }
      return [...byParent.values()].slice(0, input?.limit ?? 7);
    },

    indexArchiveRow(row) {
      return indexWriter.indexArchiveRow(row).catch((err) => {
        console.error('rag indexArchiveRow:', err.message);
      });
    },

    indexReport(reportData, helpers) {
      return indexWriter.indexReport(reportData, helpers);
    },

    deleteEphemeralBeforeDate(cutoff, ephemeralTypes) {
      return chunkStore.deleteEphemeralBeforeDate(cutoff, ephemeralTypes);
    },

    async reindexArchiveForDates(listRowsFn) {
      let total = 0;
      for (const rows of listRowsFn) {
        const r = await indexWriter.reindexArchiveRows(rows);
        total += r.chunks;
      }
      return { chunks: total };
    },

    rebuildFts() {
      chunkStore.rebuildFts();
    },
  };
}
