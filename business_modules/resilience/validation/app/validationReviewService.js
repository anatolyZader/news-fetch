/**
 * Application service: validation review queue for analysts.
 */

const ACTION_STATUS = {
  label: 'done',
  gold_signal: 'done',
  skip: 'skipped',
  defer: 'deferred',
  confirm_social_quarantine: 'done',
  dismiss_social_quarantine: 'skipped',
};

/**
 * @param {{ store: import('../domain/ports/IValidationReviewStorePort.js').IValidationReviewStorePort, evidenceStore?: object }} deps
 */
export function createValidationReviewService({ store, evidenceStore = null }) {
  if (!store) throw new Error('store is required');

  function listQueue(date, scope, opts = {}) {
    const items = store.listItems(date, scope, opts);
    return { date, scope, item_count: items.length, items };
  }

  function resolveArticleExcerpt(date, articleUrl) {
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

  return { listQueue, getItemDetail, submitDecision };
}
