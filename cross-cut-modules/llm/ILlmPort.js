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
 * @property {(opts: object) => object} stream
 *   Pass-through to `client.messages.stream(opts)`. Returns the raw Anthropic
 *   stream object (async-iterable, with `finalMessage()`) unchanged.
 * @property {(opts: object) => Promise<{ messages: Array<object>, lastAssistantText: string, stopReason: (string|null), usage: (object|null) }>} runToolLoop
 *   Pass-through to the shared tool-use loop with the client pre-bound. Callers
 *   MUST NOT pass `client` — it is supplied by the port.
 * @property {(string|undefined)} defaultModel
 *   Optional hint stored on the port for callers that opt in. NOT applied
 *   automatically by `createMessage`/`stream`.
 */

export {};
