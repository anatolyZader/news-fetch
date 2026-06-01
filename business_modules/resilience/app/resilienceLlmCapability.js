/**
 * Shared resilience LLM capability for sibling modules (facade seam for P2.4).
 */

import { createAnthropicResilienceLlmAdapter } from '../infrastructure/adapters/anthropicResilienceLlmAdapter.js';
import {
  buildSignalExtractionSystemPrompt,
  extractJsonArray,
  extractEvidence,
  synthesizeComponents,
} from '../infrastructure/claudeEvaluator.js';

/** @type {import('../domain/ports/IResilienceLlmPort.js').IResilienceLlmPort | null} */
let defaultLlmPort = null;

/**
 * @returns {import('../domain/ports/IResilienceLlmPort.js').IResilienceLlmPort}
 */
export function getDefaultResilienceLlmPort() {
  if (!defaultLlmPort) {
    defaultLlmPort = createAnthropicResilienceLlmAdapter();
  }
  return defaultLlmPort;
}

export { buildSignalExtractionSystemPrompt, extractJsonArray, extractEvidence, synthesizeComponents };
