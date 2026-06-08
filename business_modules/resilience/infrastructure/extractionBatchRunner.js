/**
 * Batch extraction via Anthropic Batch API (opt-in RESILIENCE_EXTRACT_BATCH=1).
 */
import { getDefaultBatchAdapter } from '../../../cross-cut-modules/llm/anthropicBatchAdapter.js';
import { extractJsonArray } from './claudeJsonHelpers.js';
import {
  extractMaxTokens,
  EXTRACT_PROMPT_ID,
  EXTRACT_PROMPT_VERSION,
} from '../../../cross-cut-modules/resilience-contracts/extractionPrompt.js';
/**
 * @param {Array<{ customId: string, model: string, system: string, userContent: string, label: string }>} calls
 */
export async function runExtractionBatchCalls(calls) {
  if (!calls.length) return new Map();
  const adapter = getDefaultBatchAdapter();
  const maxTokens = extractMaxTokens();
  const requests = calls.map((c) => ({
    custom_id: c.customId,
    params: {
      model: c.model,
      max_tokens: maxTokens,
      temperature: 0,
      system: c.system,
      messages: [{ role: 'user', content: c.userContent }],
    },
    callContext: {
      feature: 'extract',
      promptId: EXTRACT_PROMPT_ID,
      promptVersion: EXTRACT_PROMPT_VERSION,
      purpose: c.label,
      maxOutputTokens: maxTokens,
    },
  }));

  const results = await adapter.runBatch(requests);
  const parsed = new Map();
  for (const c of calls) {
    const item = results.get(c.customId);
    if (!item?.ok) {
      parsed.set(c.customId, { ok: false, error: item?.error ?? 'batch_failed', signals: [] });
      continue;
    }
    const textBlock = item.message.content?.find((b) => b.type === 'text');
    if (!textBlock) {
      parsed.set(c.customId, { ok: false, error: 'no_text_block', signals: [] });
      continue;
    }
    const signals = extractJsonArray(textBlock.text);
    parsed.set(c.customId, {
      ok: true,
      signals: Array.isArray(signals) ? signals : [],
      usage: item.message.usage,
    });
  }
  return parsed;
}
