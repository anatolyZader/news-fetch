/**
 * Multi-turn validation review agent loop (read-only tools + recommendation).
 */
import Anthropic from '@anthropic-ai/sdk';
import {
  validationAgentEnabledFlag,
  validationExplainEnabled,
} from '../../../../cross-cut-modules/retrieval/ragConfig.js';
import { retrieveSimilarArticles } from '../../../../cross-cut-modules/retrieval/analystRetrieval.js';
import {
  buildValidationExplainSystemPrompt,
  buildValidationExplainUserBlock,
} from '../domain/services/validationExplainPrompt.js';
import { runToolLoop } from '../../../../cross-cut-modules/llm/runToolLoop.js';

const defaultClient = new Anthropic();
const MODEL = process.env.RESILIENCE_VALIDATION_EXPLAIN_MODEL
  ?? process.env.RESILIENCE_SELF_CHECK_MODEL
  ?? 'claude-haiku-4-5-20251001';

const AGENT_TOOLS = [
  {
    name: 'get_validation_context',
    description: 'Refresh validation item context (RAG bundle).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'search_similar_articles',
    description: 'Search archive for articles similar to a query related to this item.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        top_k: { type: 'number' },
      },
      required: ['query'],
    },
  },
  {
    name: 'propose_decision',
    description: 'Recommend a validation decision (does NOT submit — human must confirm).',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['label', 'skip', 'defer', 'gold_signal', 'confirm_social_quarantine', 'dismiss_social_quarantine'],
        },
        rationale: { type: 'string' },
      },
      required: ['action', 'rationale'],
    },
  },
];

/**
 * Normalize incoming messages for Anthropic API (preserve array content).
 * @param {Array<{ role: string, content: unknown }>} messages
 */
function normalizeIncomingMessages(messages) {
  return (messages ?? []).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));
}

/**
 * @param {{
 *   validationReviewService: object,
 *   retrievalService?: object|null,
 *   date: string,
 *   scope: string,
 *   articleKey: string,
 *   messages: Array<{ role: string, content: unknown }>,
 *   client?: object,
 * }} params
 */
export async function runValidationAgent({
  validationReviewService,
  retrievalService = null,
  date,
  scope,
  articleKey,
  messages,
  client = defaultClient,
}) {
  if (!validationAgentEnabledFlag() || !validationExplainEnabled()) {
    return { error: 'Validation agent is disabled.', messages: messages ?? [] };
  }

  let itemCtx = await validationReviewService.getItemContext(date, scope, articleKey);
  if (!itemCtx) return { error: 'Queue item not found.', messages: messages ?? [] };

  const frozenContext = buildValidationExplainUserBlock(
    itemCtx.item,
    itemCtx.rag,
    'Investigate this validation flag.',
  );

  const system =
    buildValidationExplainSystemPrompt() +
    '\n\nFROZEN ITEM CONTEXT (cite from here):\n' +
    frozenContext;

  let recommendation = null;
  let currentMessages = normalizeIncomingMessages(messages);

  if (currentMessages.length === 0) {
    currentMessages = [{
      role: 'user',
      content: 'Investigate why this article was flagged and recommend an action if appropriate.',
    }];
  }

  const retrieval = retrievalService?.retrieval ?? null;

  const loopResult = await runToolLoop({
    client,
    model: MODEL,
    maxTokens: 2000,
    system,
    messages: currentMessages,
    tools: AGENT_TOOLS,
    agentKind: 'validation',
    executeTool: async (name, input) => {
      if (name === 'get_validation_context') {
        itemCtx = await validationReviewService.getItemContext(date, scope, articleKey);
        return buildValidationExplainUserBlock(
          itemCtx.item,
          itemCtx.rag,
          'Refreshed context',
        );
      }
      if (name === 'search_similar_articles') {
        const q = input?.query ?? '';
        const hits = retrieval?.hybridRetrieve
          ? await retrieveSimilarArticles(q, {
            retrieval,
            reportDate: date,
            topK: input?.top_k ?? 5,
          })
          : (itemCtx.rag?.similar_articles ?? []);
        return (hits ?? []).slice(0, 5).map((h) =>
          `- ${h.title ?? '?'}: ${String(h.snippet ?? '').slice(0, 200)}`,
        ).join('\n') || 'No similar articles.';
      }
      if (name === 'propose_decision') {
        recommendation = {
          action: input?.action,
          rationale: input?.rationale ?? '',
        };
        return `Recommendation recorded: ${recommendation.action}. Human must confirm via decision button or chat propose tool.`;
      }
      return 'Unknown tool';
    },
  });

  return {
    messages: loopResult.messages,
    answer: loopResult.lastAssistantText,
    recommendation,
    model: MODEL,
    item: itemCtx.item,
    stopReason: loopResult.stopReason,
    usage: loopResult.usage,
  };
}
