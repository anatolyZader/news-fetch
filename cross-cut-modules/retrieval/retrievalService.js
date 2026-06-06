/**
 * RAG retrieval orchestrator: rewrite → hybrid → rerank → format.
 */
import { embedText, embeddingsEnabled, embeddingModelId } from '../vector_index/index.js';
import { reciprocalRankFusion } from './hybridSearch.js';
import { cohereRerank } from './cohereRerankAdapter.js';
import { rewriteQueryForRetrieval } from './queryRewriter.js';
import { calcEmbeddingCostUsd, calcRerankCostUsd } from '../budget/app/budgetCostTracker.js';
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
import { chatRetrievalCacheKey } from './chatRetrievalCache.js';

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

async function embedQueryVector(query, onUsage) {
  if (!embeddingsEnabled()) return null;
  try {
    const emb = await embedText(query);
    if (onUsage && emb.usage?.total_tokens) {
      const model = emb.model ?? embeddingModelId();
      onUsage({
        label: 'rag:query-embed',
        model,
        costUsd: calcEmbeddingCostUsd(model, emb.usage),
        usage: { input_tokens: emb.usage.total_tokens, output_tokens: 0 },
      });
    }
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

async function hitsWithRerank(pool, q, topK, onUsage) {
  const docs = pool.map((f) => ({
    chunkId: f.chunkId,
    text: String(f.hit?.text ?? '').slice(0, 4000),
  }));
  const reranked = await cohereRerank(q, docs, {
    topN: topK,
    onUsage: onUsage
      ? (payload) => onUsage({ label: 'rag:rerank', ...payload })
      : undefined,
  });
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

function loadCachedRetrievalState(retrievalCache, sessionId, cacheQuery, geoScope, dateKey) {
  if (!retrievalCache || !sessionId) return null;
  const cached = retrievalCache.get(chatRetrievalCacheKey(sessionId, cacheQuery, geoScope, dateKey));
  if (!cached) return null;
  if (cached.hintText) return { earlyReturn: cached.hintText };
  if (cached.rewrittenQuery && cached.hits) {
    return { rewritten: cached.rewrittenQuery, hits: cached.hits };
  }
  return null;
}

async function indexReportIfNeeded(reportData, indexWriterHelpers, indexWriter) {
  if (!reportData?.assessment || !indexWriterHelpers) return;
  try {
    await indexWriter.indexReport(reportData, indexWriterHelpers);
  } catch (err) {
    console.error('rag indexReport:', err.message);
  }
}

function formatRetrievalHintLines(hits, snippetChars) {
  return hits.map((h, i) => {
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
}

function buildRetrievalHintText(hits, rewritten, snippetChars) {
  const lines = formatRetrievalHintLines(hits, snippetChars);
  return (
    `RETRIEVED CONTEXT (hybrid search + rerank; cite source_id; use get_source for full text):\n` +
    `${lines}\n\n` +
    `Search query used: ${rewritten}`
  );
}

function persistRetrievalCache(retrievalCache, sessionId, rewritten, geoScope, dateKey, hits, hintText) {
  if (!retrievalCache || !sessionId) return;
  const cacheKey = chatRetrievalCacheKey(sessionId, rewritten, geoScope, dateKey);
  const byParent = hits.map((h) => ({
    source_id: h.parentId ?? h.chunkId,
    title: h.title,
    url: h.sourceUrl,
    source_type: h.sourceType,
    published_at: null,
    snippet: clipSnippet(h.text, 350),
  }));
  retrievalCache.set(cacheKey, {
    rewrittenQuery: rewritten,
    hits,
    hintText,
    searchHits: byParent,
  });
}

/**
 * @param {ReturnType<import('./chunkStore.js').createChunkStore>} chunkStore
 * @param {ReturnType<import('./indexWriter.js').createIndexWriter>} indexWriter
 * @param {{ timezone?: string, tracePort?: object, getOnUsage?: () => Function|null }} [opts]
 */
export function createRetrievalOrchestrator(chunkStore, indexWriter, opts = {}) {
  const timezone = opts.timezone ?? process.env.TZ_ARTICLES ?? 'Asia/Jerusalem';
  const tracePort = opts.tracePort ?? null;
  const resolveOnUsage = () => {
    const fn = opts.getOnUsage?.();
    return typeof fn === 'function' ? fn : null;
  };

  async function hybridRetrieve(query, filters) {
    const run = async () => {
      const q = String(query ?? '').trim();
      if (!q) return [];

      const onUsage = filters.onUsage ?? resolveOnUsage();

      const namespaces = filters.namespaces ?? ['archive', 'report'];
      const dateTo = filters.dateTo ?? dateWindowEnd(filters.reportDate, timezone);
      const dateFrom = filters.dateFrom ?? dateWindowStart(dateTo, filters.dateWindowDays ?? ragRetrievalDays());
      const candidates = filters.candidatePool ?? ragHybridCandidates();
      const scopeId = filters.scopeId ?? null;
      const queryVector = await embedQueryVector(q, onUsage);
      const perNs = Math.ceil(candidates / namespaces.length);
      const searchCtx = { q, queryVector, perNs, dateFrom, dateTo, filters, scopeId };

      const fusedAll = namespaces.flatMap((namespace) => fuseNamespaceHits(chunkStore, namespace, searchCtx));
      fusedAll.sort((a, b) => b.rrfScore - a.rrfScore);
      const pool = fusedAll.slice(0, candidates);

      const topK = filters.topKFinal ?? ragFinalTopK();
      let hits = filters.skipRerank
        ? hitsWithoutRerank(pool, topK)
        : await hitsWithRerank(pool, q, topK, onUsage);
      hits = applyRetrievalHitFilters(hits, filters);
      return hits.slice(0, topK);
    };

    if (!tracePort) return run();
    return tracePort.startActiveSpan('sqlite.hybrid_retrieve', run);
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
        onUsage: input?.onUsage ?? resolveOnUsage(),
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

      await indexReportIfNeeded(reportData, input?.indexWriterHelpers, indexWriter);

      const sessionId = String(input?.sessionId ?? '').trim();
      const retrievalCache = input?.retrievalCache ?? null;
      const geoScope = input?.reportGeoScope === 'north' ? 'north' : 'national';
      const dateKey = String(reportData?.assessment?.date ?? reportData?.reportDate ?? '');

      let rewritten = message;
      let hits = [];

      const preCached = loadCachedRetrievalState(retrievalCache, sessionId, message, geoScope, dateKey);
      if (preCached?.earlyReturn) return preCached.earlyReturn;
      if (preCached?.hits) {
        rewritten = preCached.rewritten ?? rewritten;
        hits = preCached.hits;
      }

      if (hits.length === 0) {
        rewritten = await rewriteQueryForRetrieval(
          { message, history, systemHint },
          { onUsage: input?.onUsage ?? undefined },
        );
        const postCached = loadCachedRetrievalState(retrievalCache, sessionId, rewritten, geoScope, dateKey);
        if (postCached?.earlyReturn) return postCached.earlyReturn;
        if (postCached?.hits) {
          hits = postCached.hits;
          rewritten = postCached.rewritten ?? rewritten;
        }
        if (hits.length === 0) {
          hits = await this.retrieve({
            query: rewritten,
            reportData,
            reportGeoScope: input?.reportGeoScope,
            dateWindowDays: input?.dateWindowDays,
            onUsage: input?.onUsage ?? resolveOnUsage(),
          });
        }
      }

      if (hits.length === 0) return '';

      const snippetChars = ragContextSnippetChars();
      const hintText = buildRetrievalHintText(hits, rewritten, snippetChars);
      persistRetrievalCache(retrievalCache, sessionId, rewritten, geoScope, dateKey, hits, hintText);
      return hintText;
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
