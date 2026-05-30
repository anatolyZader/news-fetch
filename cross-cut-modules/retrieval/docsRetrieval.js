/**
 * Product docs RAG search (namespace=docs).
 */
import { docsRagEnabled, docsRagTopK, ragContextSnippetChars } from './ragConfig.js';
import { DOCS_INDEX_DATE } from './docsIndexWriter.js';

function clipSnippet(text, maxChars) {
  const s = String(text ?? '').replaceAll(/\s+/g, ' ').trim();
  const n = maxChars ?? ragContextSnippetChars();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function slugFromParentId(parentId) {
  const pid = String(parentId ?? '');
  return pid.startsWith('docs:') ? pid.slice(5) : pid;
}

function isGatedHit(hit) {
  if (hit.kind === 'docs_gated') return true;
  return /gated:\s*true/i.test(String(hit.text ?? ''));
}

/**
 * @param {string} query
 * @param {{ retrieval?: object, topK?: number, includeGated?: boolean }} opts
 */
export async function searchProductDocs(query, opts = {}) {
  if (!docsRagEnabled() || !opts.retrieval?.hybridRetrieve) {
    return [];
  }
  const q = String(query ?? '').trim();
  if (!q) return [];

  const hits = await opts.retrieval.hybridRetrieve(q, {
    namespaces: ['docs'],
    reportDate: DOCS_INDEX_DATE,
    dateFrom: DOCS_INDEX_DATE,
    dateTo: DOCS_INDEX_DATE,
    dateWindowDays: 1,
    topKFinal: opts.topK ?? docsRagTopK(),
    candidatePool: 24,
    skipRerank: true,
  });

  const includeGated = opts.includeGated === true;
  const results = [];

  for (const h of hits) {
    const gated = isGatedHit(h);
    if (!includeGated && gated) continue;
    results.push({
      slug: slugFromParentId(h.parentId),
      title: h.title ?? slugFromParentId(h.parentId),
      snippet: clipSnippet(h.text, 320),
      score: h.relevanceScore ?? h.rrfScore ?? null,
      gated,
    });
  }

  return results;
}
