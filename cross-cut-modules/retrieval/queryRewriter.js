/**
 * Session-aware query rewriting for retrieval (Haiku).
 */
import Anthropic from '@anthropic-ai/sdk';
import { ragQueryRewriteEnabled } from './ragConfig.js';

const defaultClient = new Anthropic();

/**
 * @param {{
 *  message: string,
 *  history?: Array<{ role: string, content: string }>,
 *  systemHint?: string,
 * }} input
 * @param {{ client?: import('@anthropic-ai/sdk').default }} [deps]
 * @returns {Promise<string>}
 */
export async function rewriteQueryForRetrieval(input, deps = {}) {
  const client = deps.client ?? defaultClient;
  const message = String(input?.message ?? '').trim();
  if (!message) return '';
  if (!ragQueryRewriteEnabled()) return message;

  const history = Array.isArray(input.history) ? input.history : [];
  const recent = history.slice(-6);
  if (recent.length === 0 && !input.systemHint) return message;

  const transcript = recent
    .map((h) => `${h.role}: ${String(h.content ?? '').slice(0, 500)}`)
    .join('\n');

  const system =
    'You rewrite user questions into standalone search queries for a Hebrew/English news and resilience report archive. ' +
    'Output JSON only: {"query":"..."}. Preserve key entities, dates, places, and component names. ' +
    'Do not answer the question — only produce the search query.';

  const user =
    (input.systemHint ? `Focus context: ${input.systemHint}\n\n` : '') +
    (transcript ? `Conversation:\n${transcript}\n\n` : '') +
    `Latest user message: ${message}\n\nRewrite as a search query.`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = response.content.find((b) => b.type === 'text')?.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const q = String(parsed?.query ?? '').trim();
      if (q) return q;
    }
  } catch {
    // fall through
  }
  return message;
}
