/**
 * Anthropic adapter implementing the LLM transport port (see ./ILlmPort.js).
 *
 * Constructs the SDK client once and exposes a thin, behavior-preserving
 * surface. Default construction (`new Anthropic()`) matches every existing
 * call site, which reads `ANTHROPIC_API_KEY` from the environment.
 */
import Anthropic from '@anthropic-ai/sdk';
import { runToolLoop as sharedRunToolLoop } from './runToolLoop.js';
import { withSpan } from '../observability/withSpan.js';
import { createLlmGateway } from './llmGateway.js';

/**
 * @param {{ apiKey?: string, defaultModel?: string, client?: object }} [cfg]
 * @returns {import('./ILlmPort.js').LlmPort}
 */
export function createAnthropicLlmPort(cfg = {}) {
  const client =
    cfg.client ?? (cfg.apiKey ? new Anthropic({ apiKey: cfg.apiKey }) : new Anthropic());

  return {
    createMessage: (opts) =>
      withSpan('llm.createMessage', { model: opts?.model ?? 'default' }, () =>
        client.messages.create(opts)),
    stream: (opts) =>
      withSpan('llm.stream', { model: opts?.model ?? 'default' }, () =>
        client.messages.stream(opts)),
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

/**
 * Lazy singleton for CLI scripts and call sites not yet wired for injection.
 * Construction is identical to the previous module-level `new Anthropic()`.
 * @returns {import('./ILlmPort.js').LlmPort}
 */
export function getDefaultLlmPort() {
  if (!defaultPort) {
    defaultPort = createLlmGateway(createAnthropicLlmPort());
  }
  return defaultPort;
}
