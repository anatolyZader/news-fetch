/**
 * Delegates to existing claudeEvaluator (Haiku extract + Sonnet narratives).
 */
import { extractSignals, generateNarratives } from '../claudeEvaluator.js';

export function createAnthropicResilienceLlmAdapter() {
  return {
    extractSignals,
    generateNarratives,
  };
}
