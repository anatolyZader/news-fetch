/**
 * Reciprocal Rank Fusion (RRF) for dense + lexical hit lists.
 */

/**
 * @param {Array<{ chunkId: string, [key: string]: any }>} denseHits
 * @param {Array<{ chunkId: string, [key: string]: any }>} ftsHits
 * @param {{ k?: number, topK?: number }} [opts]
 * @returns {Array<{ chunkId: string, rrfScore: number, denseRank?: number, ftsRank?: number, hit: object }>}
 */
export function reciprocalRankFusion(denseHits, ftsHits, opts = {}) {
  const k = opts.k ?? 60;
  const topK = opts.topK ?? 50;
  const scores = new Map();

  function add(hits, source) {
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      const id = String(h.chunkId ?? '');
      if (!id) continue;
      const rank = i + 1;
      const contrib = 1 / (k + rank);
      const prev = scores.get(id) ?? { chunkId: id, rrfScore: 0, hit: h };
      prev.rrfScore += contrib;
      if (source === 'dense') prev.denseRank = rank;
      if (source === 'fts') prev.ftsRank = rank;
      prev.hit = { ...prev.hit, ...h };
      scores.set(id, prev);
    }
  }

  add(denseHits ?? [], 'dense');
  add(ftsHits ?? [], 'fts');

  return [...scores.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, topK);
}
