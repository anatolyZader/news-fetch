/**
 * Anthropic adapter implementing the LLM transport port (see ./ILlmPort.js).
 *
 * Constructs the SDK client once and exposes a thin, behavior-preserving
 * surface. Default construction (`new Anthropic()`) matches every existing
 * call site, which reads `ANTHROPIC_API_KEY` from the environment.
 */
import Anthropic from '@anthropic-ai/sdk';
import { createClaudeCliLlmPort } from './claudeCliLlmAdapter.js';
import { runToolLoop as sharedRunToolLoop } from './runToolLoop.js';
import { withSpan } from '../monitoring/index.js';
import { createLlmGateway } from './llmGateway.js';
import {
  prepareAnthropicRequest,
  resolvePromptCacheFeature,
  stripAnthropicInternalParams,
} from './promptCache.js';

/**
 * @param {{ apiKey?: string, defaultModel?: string, client?: object }} [cfg]
 * @returns {import('./ILlmPort.js').LlmPort}
 */
export function createAnthropicLlmPort(cfg = {}) {
  const client =
    cfg.client ?? (cfg.apiKey ? new Anthropic({ apiKey: cfg.apiKey }) : new Anthropic());

  return {
    createMessage: (opts) =>
      withSpan('llm.createMessage', { model: opts?.model ?? 'default' }, () => {
        const prepared = prepareAnthropicRequest(opts, {
          feature: resolvePromptCacheFeature(opts),
        });
        return client.messages.create(stripAnthropicInternalParams(prepared));
      }),
    stream: (opts) => {
      const prepared = prepareAnthropicRequest(opts, {
        feature: resolvePromptCacheFeature(opts),
      });
      return client.messages.stream(stripAnthropicInternalParams(prepared));
    },
    runToolLoop: (opts) =>
      withSpan('llm.runToolLoop', {}, () => sharedRunToolLoop({ ...opts, client })),
    defaultModel: cfg.defaultModel,
  };
}

let defaultPort = null;

/**
 * Wire the app-wide LLM port from composition root (app.js).
 * @param {import('./ILlmPort.js').LlmPort} port
 */
export function setSharedLlmPort(port) {
  defaultPort = port;
}

/** True when subscription limits shouldn't apply: LLM_FORCE_API=1 (e.g. in .env) overrides claude-cli. */
function forceApiBilling() {
  const v = process.env.LLM_FORCE_API?.trim().toLowerCase();
  return v === '1' || v === 'true';
}

/**
 * Lazy singleton for CLI scripts and call sites not yet wired for injection.
 * LLM_TRANSPORT=claude-cli routes createMessage/stream through the Max-
 * subscription-billed `claude -p` adapter (pipeline CLI runs only — never the
 * server). LLM_FORCE_API=1 overrides it back to metered API billing — set it
 * in .env (or per run) when subscription limits must not interrupt urgent
 * work. Default construction is identical to the previous module-level
 * `new Anthropic()`.
 * @returns {import('./ILlmPort.js').LlmPort}
 */
export function getDefaultLlmPort() {
  if (!defaultPort) {
    const useCli = process.env.LLM_TRANSPORT === 'claude-cli' && !forceApiBilling();
    if (process.env.LLM_TRANSPORT === 'claude-cli' && forceApiBilling()) {
      console.error('  ℹ LLM_FORCE_API is set — pipeline LLM calls billed to API credits, not the Max subscription.');
    }
    const inner = useCli ? createClaudeCliLlmPort() : createAnthropicLlmPort();
    defaultPort = createLlmGateway(inner);
  }
  return defaultPort;
}

export { resolveLlmPort } from './resolveLlmPort.js';
