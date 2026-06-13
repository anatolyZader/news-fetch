/**
 * Scoped Haiku explain for validation review items (article chunks + flags only).
 */
import { getDefaultLlmPort } from '../../../cross-cut-modules/llm/anthropicLlmAdapter.js';
import { validationExplainEnabled } from '../../../cross-cut-modules/retrieval/ragConfig.js';
import {
  buildValidationExplainSystemPrompt,
  buildValidationExplainUserBlock,
} from '../domain/services/validationExplainPrompt.js';

const DEFAULT_MODEL = process.env.RESILIENCE_VALIDATION_EXPLAIN_MODEL
  ?? process.env.RESILIENCE_SELF_CHECK_MODEL
  ?? 'claude-haiku-4-5-20251001';

/**
 * @param {object} item queue item
 * @param {object} rag context from buildValidationReviewContext
 * @param {string} question
 */
export async function explainValidationItem(item, rag, question, opts = {}) {
  if (!validationExplainEnabled()) {
    return { answer: 'Validation explain is disabled (VALIDATION_EXPLAIN_ENABLED=0).' };
  }

  const userContent = buildValidationExplainUserBlock(item, rag, question);

  const message = await getDefaultLlmPort().createMessage({
    model: DEFAULT_MODEL,
    max_tokens: 1200,
    temperature: 0,
    system: buildValidationExplainSystemPrompt(),
    messages: [{ role: 'user', content: userContent }],
  });

  if (opts.onUsage && message.usage) {
    opts.onUsage({
      label: 'validation:explain',
      model: DEFAULT_MODEL,
      usage: message.usage,
    });
  }

  const textBlock = message.content.find((b) => b.type === 'text');
  return {
    answer: textBlock?.text ?? '',
    model: DEFAULT_MODEL,
  };
}
