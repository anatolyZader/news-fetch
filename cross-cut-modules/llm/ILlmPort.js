/**
 * LLM transport port. A thin, behavior-preserving abstraction over the Anthropic
 * SDK surfaces used across the app, so application/domain code depends on this
 * contract instead of importing `@anthropic-ai/sdk` directly.
 *
 * The port is intentionally transparent: it does NOT inject a default model,
 * does NOT mutate request options, and does NOT record cost. Callers pass the
 * model per call and own their own usage/cost accounting (`onUsage`,
 * `appendCostLog`) exactly as before.
 *
 * @typedef {object} LlmPort
 * @property {(opts: object) => Promise<object>} createMessage
 *   Pass-through to `client.messages.create(opts)`. Returns the raw Anthropic
 *   message object (`content[]`, `usage`, `stop_reason`, …) unchanged.
 * @property {(opts: object) => Promise<object>} stream
 *   Pass-through to `client.messages.stream(opts)`. Returns the Anthropic
 *   stream object (async-iterable, with `finalMessage()`), wrapped in a Promise
 *   when served through the LLM gateway.
 * @property {(opts: object) => Promise<{ messages: Array<object>, lastAssistantText: string, stopReason: (string|null), usage: (object|null) }>} runToolLoop
 *   Pass-through to the shared tool-use loop with the client pre-bound. Callers
 *   MUST NOT pass `client` — it is supplied by the port. Supports `toolChoice`
 *   (`{type, name?}` → Anthropic `tool_choice`); when pinned the loop can only
 *   end by round exhaustion, so pair it with `maxRounds: 0`.
 * @property {(string|undefined)} defaultModel
 *   Optional hint stored on the port for callers that opt in. NOT applied
 *   automatically by `createMessage`/`stream`.
 */

/** Sentinel — this module defines the `LlmPort` contract via JSDoc only. */
export const LLM_PORT_MODULE = true;
