/**
 * Scoped Haiku explain for validation review items (article chunks + flags only).
 */
import Anthropic from '@anthropic-ai/sdk';
import { validationExplainEnabled } from '../../../../cross-cut-modules/retrieval/ragConfig.js';
import {
  buildValidationExplainSystemPrompt,
  buildValidationExplainUserBlock,
} from '../domain/services/validationExplainPrompt.js';

const client = new Anthropic();
const DEFAULT_MODEL = process.env.RESILIENCE_VALIDATION_EXPLAIN_MODEL
  ?? process.env.RESILIENCE_SELF_CHECK_MODEL
  ?? 'claude-haiku-4-5-20251001';

/**
 * @param {object} item queue item
 * @param {object} rag context from buildValidationReviewContext
 * @param {string} question
 */
export async function explainValidationItem(item, rag, question) {
  if (!validationExplainEnabled()) {
    return { answer: 'Validation explain is disabled (VALIDATION_EXPLAIN_ENABLED=0).' };
  }

  const userContent = buildValidationExplainUserBlock(item, rag, question);

  const message = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1200,
    temperature: 0,
    system: buildValidationExplainSystemPrompt(),
    messages: [{ role: 'user', content: userContent }],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  return {
    answer: textBlock?.text ?? '',
    model: DEFAULT_MODEL,
  };
}
