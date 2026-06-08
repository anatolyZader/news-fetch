/**
 * Per-article extraction cache partition and persistence.
 */
import { CATALOG_VERSION } from '../../resilience-contracts/signalCatalog.js';
import {
  EXTRACT_PROMPT_VERSION,
  extractionCacheEnabled,
} from '../../resilience-contracts/extractionPrompt.js';
import { getMultipassMode } from './extractionCacheConfig.js';
import { logLlmCacheHit } from '../llmGateway.js';
import {
  articleContentHash,
  buildExtractCacheKey,
  getExtractionCacheStore,
} from './extractionCacheStore.js';

/**
 * @param {object[]} articles
 * @param {object} opts
 */
export function partitionArticlesByExtractCache(articles, opts) {
  if (!extractionCacheEnabled()) {
    return {
      missArticles: articles,
      origIndexByMiss: articles.map((_, i) => i),
      cachedSignals: [],
    };
  }

  const store = getExtractionCacheStore(opts.cacheDbPath);
  const model = opts.model;
  const contentKind = opts.contentKind ?? 'news';
  const domainGroup = opts.domainGroupKey ?? null;
  const multipassMode = getMultipassMode();

  const missArticles = [];
  const origIndexByMiss = [];
  const cachedSignals = [];

  for (let i = 0; i < articles.length; i++) {
    const art = articles[i];
    const contentHash = articleContentHash(art);
    const cacheKey = buildExtractCacheKey({
      contentHash,
      catalogVersion: CATALOG_VERSION,
      promptVersion: EXTRACT_PROMPT_VERSION,
      contentKind,
      domainGroup,
      model,
      multipassMode,
    });
    const cached = store.getCachedSignals(cacheKey);
    if (cached != null) {
      logLlmCacheHit({
        feature: 'extract',
        purpose: `cache_hit:${domainGroup ?? 'single'}`,
        cacheHit: 'extraction',
        promptVersion: EXTRACT_PROMPT_VERSION,
      });
      for (const s of cached) {
        cachedSignals.push({
          ...s,
          article_index: i + 1,
          article_url: s.article_url ?? art.url,
          article_source: s.article_source ?? art.source,
        });
      }
    } else {
      missArticles.push(art);
      origIndexByMiss.push(i);
    }
  }

  return { missArticles, origIndexByMiss, cachedSignals };
}

/**
 * Remap batch-relative article_index to original indices.
 * @param {object[]} signals
 * @param {number[]} origIndexByMiss
 */
export function remapMissBatchIndices(signals, origIndexByMiss) {
  return signals.map((s) => {
    const batchIdx = (s.article_index ?? 1) - 1;
    const orig = origIndexByMiss[batchIdx];
    if (orig == null) return s;
    return { ...s, article_index: orig + 1 };
  });
}

/**
 * @param {object[]} signals
 * @param {object[]} articles full original article list
 * @param {object} opts
 */
export function persistArticleExtractCache(signals, articles, opts) {
  if (!extractionCacheEnabled() || !signals.length) return;

  const store = getExtractionCacheStore(opts.cacheDbPath);
  const model = opts.model;
  const contentKind = opts.contentKind ?? 'news';
  const domainGroup = opts.domainGroupKey ?? null;
  const multipassMode = getMultipassMode();

  const byIdx = new Map();
  for (const s of signals) {
    const idx = (s.article_index ?? 1) - 1;
    if (!byIdx.has(idx)) byIdx.set(idx, []);
    byIdx.get(idx).push(s);
  }

  for (const [idx, sigs] of byIdx) {
    const art = articles[idx];
    if (!art) continue;
    const contentHash = articleContentHash(art);
    const cacheKey = buildExtractCacheKey({
      contentHash,
      catalogVersion: CATALOG_VERSION,
      promptVersion: EXTRACT_PROMPT_VERSION,
      contentKind,
      domainGroup,
      model,
      multipassMode,
    });
    store.putCachedSignals(cacheKey, {
      sourceId: art.source_id ?? null,
      contentHash,
      catalogVersion: CATALOG_VERSION,
      promptVersion: EXTRACT_PROMPT_VERSION,
      domainGroup,
      contentKind,
      model,
    }, sigs);
  }
}
