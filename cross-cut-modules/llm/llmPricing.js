/**
 * LLM cost calculation including Anthropic prompt-cache token lines.
 */

/** @type {Record<string, { input: number, output: number, cacheRead?: number, cacheWrite?: number }>} */
export const LLM_PRICING = {
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-opus-4-6': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
};

/**
 * @param {string} model
 * @param {{
 *   input_tokens?: number,
 *   output_tokens?: number,
 *   cache_read_input_tokens?: number,
 *   cache_creation_input_tokens?: number,
 * }} [usage]
 * @returns {number}
 */
export function calcLlmCostUsd(model, usage) {
  if (!usage) return 0;
  const p = LLM_PRICING[model];
  if (!p) return 0;

  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;

  const inputRate = p.input / 1_000_000;
  const outputRate = p.output / 1_000_000;
  const cacheReadRate = (p.cacheRead ?? p.input * 0.1) / 1_000_000;
  const cacheWriteRate = (p.cacheWrite ?? p.input * 1.25) / 1_000_000;

  return (
    input * inputRate
    + output * outputRate
    + cacheRead * cacheReadRate
    + cacheWrite * cacheWriteRate
  );
}

/**
 * @param {object} usage
 */
export function normalizeUsageTokens(usage) {
  if (!usage || typeof usage !== 'object') {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
    };
  }
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cachedInputTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
  };
}
