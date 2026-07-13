/**
 * Pipeline RAG helpers: extract span selection and narrative grounding.
 */
import { domainIntentQuery } from './domainIntentQueries.js';
import {
  resilienceExtractRagEnabled,
  resilienceExtractRagDays,
  resilienceExtractSpansPerArticle,
  resilienceNarrativeRagEnabled,
  resilienceNarrativeRagTopK,
  ragPipelineEnabled,
} from './ragConfig.js';
import { RESILIENCE_COMPONENTS } from '../../business_modules/resilience_scorer/index.js';

const MAX_PROMPT_BODY_CHARS = 2000;

function mergeChunksToPromptBody(hits, maxChars = MAX_PROMPT_BODY_CHARS) {
  const sorted = [...hits].sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0));
  const parts = [];
  let len = 0;
  for (const h of sorted) {
    const t = String(h.text ?? '').trim();
    if (!t) continue;
    if (len + t.length > maxChars && parts.length > 0) break;
    parts.push(t);
    len += t.length + 2;
  }
  return parts.join('\n\n').slice(0, maxChars);
}

function rankHitsForArticle(hits, sourceId, title, topK) {
  const pid = String(sourceId ?? '').trim();
  const exact = hits.filter((h) => (h.parentId ?? '') === pid);
  if (exact.length >= topK) {
    return exact.slice(0, topK);
  }
  const titleNorm = String(title ?? '').trim().toLowerCase().slice(0, 60);
  const neighbors = hits.filter((h) => {
    if ((h.parentId ?? '') === pid) return false;
    if (!titleNorm) return true;
    return String(h.title ?? '').trim().toLowerCase().includes(titleNorm.slice(0, 20))
      || titleNorm.includes(String(h.title ?? '').trim().toLowerCase().slice(0, 20));
  });
  const merged = [...exact];
  for (const h of neighbors) {
    if (merged.length >= topK) break;
    if (!merged.some((x) => x.chunkId === h.chunkId)) merged.push(h);
  }
  if (merged.length < topK) {
    for (const h of hits) {
      if (merged.length >= topK) break;
      if (!merged.some((x) => x.chunkId === h.chunkId)) merged.push(h);
    }
  }
  return merged.slice(0, topK);
}

/**
 * @param {object} article — needs source_id
 * @param {{ retrieval: object, domainGroupKey?: string|null, reportDate?: string, windowDays?: number }} opts
 * @returns {Promise<string|null>}
 */
export async function selectArticlePromptSpans(article, opts = {}) {
  if (!ragPipelineEnabled() || !resilienceExtractRagEnabled()) return null;
  const retrieval = opts.retrieval;
  if (!retrieval?.hybridRetrieve) return null;

  const sourceId = String(article?.source_id ?? '').trim();
  if (!sourceId) return null;

  const domainKey = opts.domainGroupKey ?? null;
  const intent = domainIntentQuery(domainKey);
  const title = String(article?.title ?? '').trim();
  const query = title ? `${intent} ${title}` : intent;
  const reportDate = opts.reportDate ?? article?.date ?? null;
  const windowDays = opts.windowDays ?? resilienceExtractRagDays();
  const topK = resilienceExtractSpansPerArticle();

  let hits = await retrieval.hybridRetrieve(query, {
    namespaces: ['archive'],
    reportDate,
    dateWindowDays: windowDays,
    topKFinal: Math.max(topK * 2, 12),
    candidatePool: 40,
    skipRerank: true,
  });

  const exact = hits.filter((h) => (h.parentId ?? '') === sourceId);
  if (exact.length < topK && retrieval.listArchiveChunksByParent) {
    const direct = retrieval.listArchiveChunksByParent(sourceId);
    const seen = new Set(hits.map((h) => h.chunkId));
    for (const h of direct) {
      if (!seen.has(h.chunkId)) hits.push(h);
    }
  }

  if (!hits.length) return null;
  const ranked = rankHitsForArticle(hits, sourceId, title, topK);
  const body = mergeChunksToPromptBody(ranked);
  return body || null;
}

/**
 * @param {{ scoredComponents: object, registry: object, reportDate: string, retrieval: object }} input
 * @returns {Promise<Record<string, Array<{ source_id: string, chunk_index: number, text: string, url?: string }>>>}
 */
export async function retrieveNarrativeGrounding(input) {
  const empty = {};
  if (!ragPipelineEnabled() || !resilienceNarrativeRagEnabled()) return empty;
  const retrieval = input?.retrieval;
  if (!retrieval?.hybridRetrieve) return empty;

  const registry = input.registry;
  const reportDate = input.reportDate;
  const topK = resilienceNarrativeRagTopK();
  const spansByComponent = {};

  for (const def of RESILIENCE_COMPONENTS) {
    const entries = registry?.byComponent?.[def.id] ?? [];
    if (!entries.length) continue;

    const evidenceLines = entries
      .slice(0, 3)
      .map((e) => String(e.signal?.evidence ?? '').trim())
      .filter(Boolean);
    const query = `${def.description ?? def.id} ${evidenceLines.join(' ')}`.trim();
    if (!query) continue;

    const hits = await retrieval.hybridRetrieve(query, {
      namespaces: ['archive'],
      reportDate,
      dateWindowDays: resilienceExtractRagDays(),
      topKFinal: topK * 3,
      candidatePool: 30,
      skipRerank: true,
    });

    const sourceIds = new Set(
      entries.map((e) => e.signal?.source_id).filter(Boolean),
    );
    let picked = hits.filter((h) => sourceIds.has(h.parentId));
    if (picked.length < topK) {
      picked = [...picked, ...hits.filter((h) => !picked.some((p) => p.chunkId === h.chunkId))];
    }
    spansByComponent[def.id] = picked.slice(0, topK).map((h) => ({
      source_id: h.parentId ?? h.chunkId,
      chunk_index: h.chunkIndex ?? 0,
      text: String(h.text ?? '').trim(),
      url: h.sourceUrl ?? undefined,
    }));
  }

  return spansByComponent;
}

/**
 * @param {Record<string, Array<{ source_id: string, chunk_index: number, text: string, url?: string }>>} spansByComponent
 * @returns {string}
 */
export function formatRetrievedSpansBlock(spansByComponent) {
  if (!spansByComponent || Object.keys(spansByComponent).length === 0) return '';
  const lines = ['━━━ RETRIEVED PRIMARY SOURCES (cite source_id; do not invent quotes) ━━━'];
  for (const def of RESILIENCE_COMPONENTS) {
    const spans = spansByComponent[def.id] ?? [];
    if (!spans.length) continue;
    lines.push(`**${def.id}**:`);
    for (const sp of spans) {
      const url = sp.url ? ` url=${sp.url}` : '';
      lines.push(
        `  - source_id=${sp.source_id} chunk=c${sp.chunk_index}${url}\n    "${String(sp.text).replaceAll('"', "'")}"`,
      );
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}
