/**
 * Analyst-workflow RAG: PBO history.
 */
import {
  pboReviewRagEnabled,
  pboRagRetentionDays,
  ragContextSnippetChars,
} from './ragConfig.js';

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
