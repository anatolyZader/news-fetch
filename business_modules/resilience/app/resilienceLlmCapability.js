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
 * @param {import('../domain/ports/IResilienceLlmPort.js').IResilienceLlmPort} port
 */
export function setDefaultResilienceLlmPort(port) {
  defaultLlmPort = port;
}

/**
 * @returns {import('../domain/ports/IResilienceLlmPort.js').IResilienceLlmPort}
 */
export function getDefaultResilienceLlmPort() {
  if (!defaultLlmPort) {
    defaultLlmPort = createAnthropicResilienceLlmAdapter();
  }
  return defaultLlmPort;
}

/** Reset cached LLM port (tests). */
export function resetDefaultResilienceLlmPortForTests() {
  defaultLlmPort = null;
}

/**
 * @param {{ llmPort?: import('../domain/ports/IResilienceLlmPort.js').IResilienceLlmPort }} [deps]
 */
export function createResilienceLlmCapability(deps = {}) {
  const llmPort = deps.llmPort ?? createAnthropicResilienceLlmAdapter();
  return {
    llmPort,
    buildSignalExtractionSystemPrompt,
    extractJsonArray,
    extractEvidence,
    synthesizeComponents,
  };
}

export { buildSignalExtractionSystemPrompt, extractJsonArray, extractEvidence, synthesizeComponents };
