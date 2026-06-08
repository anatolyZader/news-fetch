/**
 * Feature flag for deterministic chat fallback when LLM budget is exhausted.
 */

export function chatDeterministicFallbackEnabled() {
  return process.env.CHAT_DETERMINISTIC_FALLBACK !== '0';
}
