/**
 * Delegates to claudeEvaluator (Haiku extract).
 */
import { extractSignals } from '../claudeEvaluator.js';

export function createAnthropicResilienceLlmAdapter() {
  return {
    extractSignals,
  };
}
