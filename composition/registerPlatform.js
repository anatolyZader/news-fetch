import { createAnthropicLlmPort, setSharedLlmPort } from '../cross-cut-modules/llm/anthropicLlmAdapter.js';
import { createLlmGateway } from '../cross-cut-modules/llm/llmGateway.js';
import { createAgentKernel } from '../cross-cut-modules/agent/index.js';

/** Max characters stored for evidence draft (SQLite TEXT + API body). */
export const MAX_EVIDENCE_DRAFT_CHARS = 500_000;

/**
 * Shared LLM transport port for chat, validation, and app-layer services.
 * @returns {{ sharedLlmPort: import('../cross-cut-modules/llm/ILlmPort.js').LlmPort, agentKernel: ReturnType<typeof createAgentKernel> }}
 */
export function registerPlatform() {
  const innerPort = createAnthropicLlmPort();
  const sharedLlmPort = createLlmGateway(innerPort);
  setSharedLlmPort(sharedLlmPort);
  const agentKernel = createAgentKernel({ llmPort: sharedLlmPort });
  return { sharedLlmPort, agentKernel };
}
