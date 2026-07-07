/**
 * Analyst-workflow RAG: validation review, catalog taxonomy, PBO history.
 */
import { resolve } from 'node:path';
import { embedText, embeddingsEnabled } from '../vector_index/index.js';
import { clusterByPrefix, clusterByEmbedding } from '../learningCapture/oovClusterer.js';
import { evidenceTextForRecord } from '../learningCapture/recordHelpers.js';
import { LearningCaptureFsAdapter } from '../../business_modules/signal_catalog_evolution/index.js';
import {
  validationReviewRagEnabled,
  signalCatalogEvolutionRagEnabled,
  catalogRagTopK,
  pboReviewRagEnabled,
  pboRagRetentionDays,
  ragRetrievalDays,
  ragContextSnippetChars,
} from './ragConfig.js';
import { CATALOG_INDEX_DATE } from './catalogIndexWriter.js';

function normalizeEvidenceKey(text) {
  return String(text ?? '')
    .toLowerCase()
    .replaceAll(/[^\w\u0590-\u05FF]/g, '')
    .slice(0, 80);
}

function clipSnippet(text, maxChars) {
  const s = String(text ?? '').replaceAll(/\s+/g, ' ').trim();
  const n = maxChars ?? ragContextSnippetChars();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function dateWindowStart(endDate, days) {
  const d = new Date(`${endDate}T12:00:00`);
  d.setDate(d.getDate() - Math.max(0, days - 1));
  return d.toISOString().slice(0, 10);
}

/**
 * @param {object} item queue item
 * @param {object|null} sourceArchive
 */
export async function resolveSourceIdForQueueItem(item, sourceArchive) {
  const url = String(item?.article_url ?? '').trim();
  if (!sourceArchive) return null;

  if (url && sourceArchive.search) {
    try {
      const hits = sourceArchive.search({ query: url, date: item.date, limit: 5 });
      const match = (hits ?? []).find((h) => {
        const u = h.source_url ?? h.url;
        return u && String(u) === url;
      });
      if (match?.source_id) return match.source_id;
    } catch { /* ignore */ }
  }

  const key = String(item?.article_key ?? '');
  if (key.startsWith('url:') && sourceArchive.getBySourceId) {
    const tryUrl = key.slice(4);
    const rows = sourceArchive.listByDate?.(item.date) ?? [];
    for (const row of rows) {
      if (String(row.source_url ?? '') === tryUrl) return row.source_id;
    }
  }
  return null;
}

/**
 * @param {string} query
 * @param {{ retrieval: object, sourceId?: string, reportDate: string, days?: number, topK?: number }} opts
 */
export async function retrieveSimilarArticles(query, opts) {
  if (!validationReviewRagEnabled() || !opts.retrieval?.hybridRetrieve) return [];
  const reportDate = opts.reportDate;
  const days = opts.days ?? ragRetrievalDays();
  const hits = await opts.retrieval.hybridRetrieve(String(query), {
    namespaces: ['archive'],
    reportDate,
    dateWindowDays: days,
    topKFinal: opts.topK ?? 6,
    candidatePool: 30,
    skipRerank: true,
  });
  const exclude = opts.sourceId ? String(opts.sourceId) : null;
  const filtered = hits.filter((h) => (h.parentId ?? '') !== exclude);
  return filtered.slice(0, opts.topK ?? 6).map((h) => ({
    source_id: h.parentId,
    title: h.title,
    url: h.sourceUrl,
    date: h.date,
    source_type: h.sourceType,
    snippet: clipSnippet(h.text, 350),
    chunk_index: h.chunkIndex ?? 0,
  }));
}

/**
 * @param {string} evidence
 * @param {object|null} storyClusterIndex
 * @param {object} item
 */
export async function retrieveSameStory(evidence, storyClusterIndex, item) {
  if (!storyClusterIndex?.findNearestCluster) return null;
  const types = item.signal_types?.length ? item.signal_types : ['_'];
  return storyClusterIndex.findNearestCluster(evidence, {
    sourceType: item.signals?.[0]?.source_type ?? 'news',
    signalTypes: types,
  });
}

/**
 * @param {object} store validation sqlite store
 */
export function retrievePriorDecisions(store, { evidence, articleUrl, limit = 5, excludeDate = null }) {
  if (!store?.listPriorDecisionsByEvidencePrefix) return [];
  const prefix = normalizeEvidenceKey(evidence);
  if (!prefix && !articleUrl) return [];
  return store.listPriorDecisionsByEvidencePrefix(prefix, {
    limit,
    excludeDate,
    articleUrl: articleUrl ?? null,
  });
}

/**
 * @param {string} evidence
 * @param {{ maxDays?: number, reportsDir?: string }} [opts]
 */
export async function retrieveOovNeighbors(evidence, opts = {}) {
  const adapter = new LearningCaptureFsAdapter({
    capturesDir: opts.capturesDir ?? opts.reportsDir ?? resolve(process.cwd(), 'business_modules/resilience_scorer/data/captures'),
  });
  const { records } = await adapter.loadCaptureRecords({ maxDays: opts.maxDays ?? 14 });
  if (!records.length) return [];

  const query = String(evidence ?? '').trim();
  const related = records.filter((r) => {
    const t = evidenceTextForRecord(r);
    if (!query || !t) return false;
    const a = normalizeEvidenceKey(query);
    const b = normalizeEvidenceKey(t);
    return a.slice(0, 40) === b.slice(0, 40) || t.includes(query.slice(0, 60));
  });
  const pool = related.length ? related : records.slice(0, 40);

  let clusters;
  if (embeddingsEnabled() && pool.length >= 2) {
    try {
      const embeddings = await Promise.all(
        pool.slice(0, 30).map((r) => embedText(evidenceTextForRecord(r))),
      );
      clusters = clusterByEmbedding(pool.slice(0, 30), embeddings, 0.82);
    } catch {
      clusters = clusterByPrefix(pool);
    }
  } else {
    clusters = clusterByPrefix(pool);
  }

  const top = clusters[0];
  if (!top) return [];
  return {
    cluster_key: top.key,
    count: top.count,
    related_types: top.related_types ?? [],
    samples: (top.sample_evidence ?? []).slice(0, 3),
  };
}

/**
 * @param {object} item
 * @param {{ retrievalService?: object, sourceArchive?: object, storyClusterIndex?: object, store?: object, reportsDir?: string }} deps
 */
export async function buildValidationReviewContext(item, deps = {}) {
  if (!validationReviewRagEnabled()) {
    return {
      similar_articles: [],
      same_story: null,
      prior_decisions: [],
      oov_neighbors: null,
      article_chunks: [],
    };
  }

  const retrieval = deps.retrievalService?.retrieval;
  const evidence = String(item.signals?.[0]?.evidence ?? '').trim();
  const query = [evidence, item.article_source, ...(item.signal_types ?? [])].filter(Boolean).join(' ');
  const sourceId = await resolveSourceIdForQueueItem(item, deps.sourceArchive);

  let article_chunks = [];
  if (sourceId && retrieval?.listArchiveChunksByParent) {
    article_chunks = retrieval.listArchiveChunksByParent(sourceId).map((h) => ({
      source_id: h.parentId,
      chunk_index: h.chunkIndex,
      text: clipSnippet(h.text, 600),
    }));
  }

  const [similar_articles, same_story, prior_decisions, oov_neighbors] = await Promise.all([
    retrieveSimilarArticles(query, {
      retrieval,
      sourceId,
      reportDate: item.date,
      topK: 5,
    }),
    retrieveSameStory(evidence, deps.storyClusterIndex, item),
    Promise.resolve(retrievePriorDecisions(deps.store, {
      evidence,
      articleUrl: item.article_url,
      limit: 5,
      excludeDate: item.date,
    })),
    retrieveOovNeighbors(evidence, { reportsDir: deps.reportsDir }),
  ]);

  return {
    similar_articles,
    same_story,
    prior_decisions,
    oov_neighbors,
    article_chunks,
    source_id: sourceId,
  };
}

/**
 * @param {string} text
 * @param {object} retrieval orchestrator
 */
export async function retrieveCatalogNeighbors(text, retrieval) {
  if (!signalCatalogEvolutionRagEnabled() || !retrieval?.hybridRetrieve) {
    return { nearest_catalog: [], counterexamples: [] };
  }
  const q = String(text ?? '').trim();
  if (!q) return { nearest_catalog: [], counterexamples: [] };

  const hits = await retrieval.hybridRetrieve(q, {
    namespaces: ['catalog'],
    reportDate: CATALOG_INDEX_DATE,
    dateFrom: CATALOG_INDEX_DATE,
    dateTo: CATALOG_INDEX_DATE,
    dateWindowDays: 1,
    topKFinal: catalogRagTopK() * 2,
    candidatePool: 24,
    skipRerank: true,
  });

  const nearest_catalog = hits.slice(0, catalogRagTopK()).map((h) => ({
    type: String(h.parentId ?? '').replace(/^catalog:/, ''),
    label: h.title,
    score: h.relevanceScore ?? h.rrfScore,
    snippet: clipSnippet(h.text, 280),
  }));

  const counterexamples = hits
    .filter((h) => String(h.text ?? '').includes('reject_patterns:'))
    .slice(0, 3)
    .map((h) => {
      const m = /reject_patterns:\s*(.+)/i.exec(String(h.text));
      return {
        type: String(h.parentId ?? '').replace(/^catalog:/, ''),
        reject_snippet: m?.[1]?.trim() ?? clipSnippet(h.text, 120),
      };
    });

  return { nearest_catalog, counterexamples };
}

/**
 * @param {string} query
 * @param {{ retrieval: object, districtId?: string, municipality?: string, regionId?: string, reportDate?: string, days?: number, topK?: number }} opts
 */
export async function retrievePboHistory(query, opts) {
  if (!pboReviewRagEnabled() || !opts.retrieval?.hybridRetrieve) return [];
  const q = String(query ?? '').trim();
  if (!q) return [];

  const reportDate = opts.reportDate ?? new Date().toISOString().slice(0, 10);
  const days = opts.days ?? pboRagRetentionDays();
  const dateTo = reportDate;
  const dateFrom = dateWindowStart(dateTo, days);

  let enrichedQuery = q;
  if (opts.municipality) enrichedQuery += ` ${opts.municipality}`;
  if (opts.regionId) enrichedQuery += ` ${opts.regionId}`;

  const hits = await opts.retrieval.hybridRetrieve(enrichedQuery, {
    namespaces: ['archive'],
    reportDate,
    dateFrom,
    dateTo,
    dateWindowDays: days,
    sourceTypes: ['pbo', 'pbo_regional'],
    scopeId: opts.districtId ?? null,
    topKFinal: opts.topK ?? 8,
    candidatePool: 36,
    skipRerank: true,
  });

  return hits.map((h) => ({
    source_id: h.parentId,
    title: h.title,
    date: h.date,
    source_type: h.sourceType,
    scope_id: h.scopeId,
    snippet: clipSnippet(h.text, 400),
    chunk_index: h.chunkIndex ?? 0,
  }));
}
