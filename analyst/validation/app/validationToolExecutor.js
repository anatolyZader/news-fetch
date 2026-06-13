/**
 * Shared validation agent tool execution (chat hub + validation /agent route).
 */
import { retrieveSimilarArticles } from '../../../cross-cut-modules/retrieval/analystRetrieval.js';
import {
  buildValidationExplainUserBlock,
} from '../domain/services/validationExplainPrompt.js';

const VALIDATION_DECISION_ACTIONS = new Set([
  'label', 'skip', 'defer', 'gold_signal', 'confirm_social_quarantine', 'dismiss_social_quarantine',
]);

/**
 * @param {string} name
 * @param {object} input
 * @param {{
 *   validationReviewService: object,
 *   retrieval?: object|null,
 *   date: string,
 *   scope: string,
 *   articleKey: string,
 *   getItemCtx: () => object,
 *   setItemCtx: (ctx: object) => void,
 *   setRecommendation: (rec: object|null) => void,
 * }} ctx
 * @returns {Promise<string>}
 */
export async function executeValidationTool(name, input, ctx) {
  const {
    validationReviewService,
    retrieval = null,
    date,
    scope,
    articleKey,
    getItemCtx,
    setItemCtx,
    setRecommendation,
  } = ctx;

  if (name === 'get_validation_context') {
    const itemCtx = await validationReviewService.getItemContext(date, scope, articleKey, {
      forceRefresh: true,
    });
    setItemCtx(itemCtx);
    return buildValidationExplainUserBlock(
      itemCtx.item,
      itemCtx.rag,
      'Refreshed context',
    );
  }

  if (name === 'search_similar_articles') {
    const q = input?.query ?? '';
    const itemCtx = getItemCtx();
    const hits = retrieval?.hybridRetrieve
      ? await retrieveSimilarArticles(q, {
        retrieval,
        reportDate: date,
        topK: input?.top_k ?? 5,
      })
      : (itemCtx?.rag?.similar_articles ?? []);
    return (hits ?? []).slice(0, 5).map((h) =>
      `- ${h.title ?? '?'}: ${String(h.snippet ?? '').slice(0, 200)}`,
    ).join('\n') || 'No similar articles.';
  }

  if (name === 'propose_decision') {
    const action = String(input?.action ?? '');
    if (!VALIDATION_DECISION_ACTIONS.has(action)) {
      return `Invalid action "${action}". Allowed: ${[...VALIDATION_DECISION_ACTIONS].join(', ')}`;
    }
    const recommendation = {
      action,
      rationale: input?.rationale ?? '',
    };
    setRecommendation(recommendation);
    return `Recommendation recorded: ${recommendation.action}. Human must confirm via decision button or chat propose tool.`;
  }

  return 'Unknown tool';
}

/**
 * Format similar-article hits for chat (no validation item required).
 * @param {string} query
 * @param {{ retrieval?: object, reportDate?: string, topK?: number, fallbackHits?: Array<object> }} opts
 */
export async function formatSimilarArticlesForChat(query, opts = {}) {
  const { retrieval = null, reportDate, topK = 5, fallbackHits = [] } = opts;
  const hits = retrieval?.hybridRetrieve
    ? await retrieveSimilarArticles(query, {
      retrieval,
      reportDate,
      topK,
    })
    : fallbackHits;
  return (hits ?? []).slice(0, topK).map((h) =>
    `- ${h.title ?? '?'}: ${String(h.snippet ?? '').slice(0, 200)}`,
  ).join('\n') || 'No similar articles.';
}

export { VALIDATION_DECISION_ACTIONS };
