/**
 * Compress multi-hop retrieval tool JSON for LLM context (full payloads in trace).
 */

function snippet(text, max = 200) {
  return String(text ?? '').slice(0, max);
}

function scoreOf(hit) {
  return hit.rrfScore ?? hit.relevanceScore ?? hit.score ?? null;
}

/**
 * @param {object} hit
 */
export function compressHit(hit) {
  return {
    source_id: hit.parentId ?? hit.source_id ?? hit.chunkId ?? hit.id ?? null,
    source_type: hit.sourceType ?? hit.source_type ?? null,
    title: hit.title ?? null,
    snippet_200: snippet(hit.text ?? hit.snippet ?? ''),
    score: scoreOf(hit),
  };
}

/**
 * @param {object[]} hits
 * @param {{ maxHits?: number }} opts
 */
export function compressHitList(hits, opts = {}) {
  const maxHits = opts.maxHits ?? 4;
  const list = hits ?? [];
  const compressed = list.slice(0, maxHits).map(compressHit);
  return {
    truncated: list.length > maxHits,
    total_hits: list.length,
    hits: compressed,
  };
}

/**
 * @param {object} raw — retrieveForClaim result
 * @param {{ maxHits?: number, escalated?: boolean }} opts
 */
export function compressRetrieveForClaim(raw, opts = {}) {
  const maxHits = opts.maxHits ?? (opts.escalated ? 8 : 4);
  return {
    support: compressHitList(raw?.support ?? [], { maxHits }),
    contradict: compressHitList(raw?.contradict ?? [], { maxHits: Math.max(3, maxHits - 2) }),
  };
}

/**
 * @param {object[]|object} raw
 * @param {{ maxHits?: number, escalated?: boolean }} opts
 */
export function compressRetrieveResult(raw, opts = {}) {
  const maxHits = opts.maxHits ?? (opts.escalated ? 8 : 4);
  if (Array.isArray(raw)) {
    return compressHitList(raw, { maxHits });
  }
  if (raw?.support != null || raw?.contradict != null) {
    return compressRetrieveForClaim(raw, opts);
  }
  return compressHitList(raw?.hits ?? [], { maxHits });
}

/**
 * @param {Record<string, object[]>} raw
 * @param {{ maxSourceTypes?: number, maxHitsPerType?: number, escalated?: boolean }} opts
 */
export function compressCrossSourceCompare(raw, opts = {}) {
  const maxTypes = opts.maxSourceTypes ?? (opts.escalated ? 3 : 2);
  const maxPerType = opts.maxHitsPerType ?? (opts.escalated ? 5 : 3);
  const entries = Object.entries(raw ?? {}).slice(0, maxTypes);
  const out = {};
  for (const [st, hits] of entries) {
    out[st] = compressHitList(hits ?? [], { maxHits: maxPerType });
  }
  const allTypes = Object.keys(raw ?? {});
  return {
    truncated: allTypes.length > maxTypes,
    total_source_types: allTypes.length,
    total_hits: allTypes.reduce((s, k) => s + (raw[k]?.length ?? 0), 0),
    by_source_type: out,
  };
}

/**
 * Trim long strings in recall / profile payloads.
 * @param {object} raw
 */
export function compressStructuredPayload(raw) {
  if (raw == null) return raw;
  const text = JSON.stringify(raw);
  if (text.length <= 4000) return raw;
  if (Array.isArray(raw)) {
    return raw.slice(0, 10).map((item) => {
      if (typeof item === 'object' && item !== null) {
        const copy = { ...item };
        if (copy.narrative_excerpt) copy.narrative_excerpt = snippet(copy.narrative_excerpt, 200);
        return copy;
      }
      return item;
    });
  }
  return raw;
}
