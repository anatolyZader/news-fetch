/**
 * Resolve LlmPort from injection opts (llmPort, SDK client mock, apiKey, or app default).
 */
import { createAnthropicLlmPort, getDefaultLlmPort } from './anthropicLlmAdapter.js';
import { createLlmGateway } from './llmGateway.js';

/**
 * @param {{ llmPort?: import('./ILlmPort.js').LlmPort, client?: object, apiKey?: string }} [opts]
 * @returns {import('./ILlmPort.js').LlmPort}
 */
export function resolveLlmPort(opts = {}) {
  if (opts.llmPort) return opts.llmPort;
  if (opts.client) {
    return createLlmGateway(createAnthropicLlmPort({ client: opts.client }));
  }
  if (opts.apiKey) {
    return createLlmGateway(createAnthropicLlmPort({ apiKey: opts.apiKey }));
  }
  return getDefaultLlmPort();
}
