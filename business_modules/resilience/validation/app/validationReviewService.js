/**
 * Application service: validation review queue for analysts.
 */
import { buildValidationReviewContext } from '../../../../cross-cut-modules/retrieval/analystRetrieval.js';
import { validationReviewRagEnabled } from '../../../../cross-cut-modules/retrieval/ragConfig.js';
import {
  getValidationRagCache,
  setValidationRagCache,
  validationRagCacheKey,
} from '../../../../cross-cut-modules/retrieval/validationRagContextCache.js';
import { explainValidationItem } from './validationReviewExplain.js';

const ACTION_STATUS = {
  label: 'done',
  gold_signal: 'done',
  skip: 'skipped',
  defer: 'deferred',
  confirm_social_quarantine: 'done',
  dismiss_social_quarantine: 'skipped',
};

/**
 * @param {{
 *   store: import('../domain/ports/IValidationReviewStorePort.js').IValidationReviewStorePort,
 *   evidenceStore?: object|null,
 *   sourceArchive?: object|null,
 *   retrievalService?: object|null,
 *   storyClusterIndex?: object|null,
 *   reportsDir?: string,
 * }} deps
 */
export function createValidationReviewService(deps) {
  const {
    store,
    evidenceStore = null,
    sourceArchive = null,
    retrievalService = null,
    storyClusterIndex = null,
    reportsDir = 'daily_reports',
  } = deps;
  if (!store) throw new Error('store is required');

  function listQueue(date, scope, opts = {}) {
    const items = store.listItems(date, scope, opts);
    return { date, scope, item_count: items.length, items };
  }

  function resolveArticleExcerpt(date, articleUrl, sourceId = null) {
    if (sourceId && sourceArchive?.getBySourceId) {
      const row = sourceArchive.getBySourceId(sourceId, { includeBody: true });
      if (row?.body) {
        return {
          title: row.title ?? null,
          url: row.source_url ?? articleUrl,
          excerpt: String(row.body).slice(0, 1200),
          source_id: sourceId,
        };
      }
    }
    if (!evidenceStore || !articleUrl) return null;
    const items = evidenceStore.getByDate(date) ?? [];
    const match = items.find((row) => {
      const url = row.url ?? row.source_url ?? row.link;
      return url && String(url) === String(articleUrl);
    });
    if (!match) return null;
    const text = match.content ?? match.text ?? match.body ?? '';
    return {
      title: match.title ?? null,
      url: match.url ?? articleUrl,
      excerpt: String(text).slice(0, 1200),
    };
  }

  function getItemDetail(date, scope, articleKey) {
    const item = store.getItem(date, scope, articleKey);
    if (!item) return null;
    return { ...item, article: resolveArticleExcerpt(date, item.article_url) };
  }

  async function getItemContext(date, scope, articleKey, opts = {}) {
    const item = store.getItem(date, scope, articleKey);
    if (!item) return null;

    const cacheKey = validationRagCacheKey(date, scope, articleKey);
    if (!opts.forceRefresh && validationReviewRagEnabled()) {
      const cached = getValidationRagCache(cacheKey);
      if (cached) {
        return { item, article: cached.article, rag: cached.rag };
      }
    }

    let article = null;
    let rag = {
      similar_articles: [],
      same_story: null,
      prior_decisions: [],
      oov_neighbors: null,
      article_chunks: [],
    };

    if (validationReviewRagEnabled()) {
      rag = await buildValidationReviewContext(item, {
        retrievalService,
        sourceArchive,
        storyClusterIndex,
        store,
        reportsDir,
      });
      article = resolveArticleExcerpt(date, item.article_url, rag.source_id);
      setValidationRagCache(cacheKey, { rag, article });
    } else {
      article = resolveArticleExcerpt(date, item.article_url);
    }

    return { item, article, rag };
  }

  async function explainItem(date, scope, articleKey, question, opts = {}) {
    const ctx = await getItemContext(date, scope, articleKey, opts);
    if (!ctx) return null;
    const result = await explainValidationItem(ctx.item, ctx.rag, question, {
      onUsage: opts.onUsage ?? null,
    });
    return { ...result, item: ctx.item };
  }

  function submitDecision(date, scope, articleKey, reviewer, { action, payload }) {
    const act = String(action ?? 'skip');
    const status = ACTION_STATUS[act] ?? 'done';
    store.appendDecision({
      date,
      scope,
      article_key: articleKey,
      reviewerEmail: reviewer.email ?? '',
      action: act,
      payload: payload ?? {},
    });
    return store.updateItemStatus(date, scope, articleKey, status);
  }

  return {
    listQueue,
    getItemDetail,
    getItemContext,
    explainItem,
    submitDecision,
  };
}
