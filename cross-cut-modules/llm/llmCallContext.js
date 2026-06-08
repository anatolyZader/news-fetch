/**
 * Normalized metadata for LLM gateway telemetry.
 */
import { randomUUID } from 'node:crypto';

/**
 * @typedef {object} LlmCallContext
 * @property {string} [feature]
 * @property {string} [agentName]
 * @property {string} [purpose]
 * @property {string} [promptId]
 * @property {string} [promptVersion]
 * @property {string} [schemaVersion]
 * @property {string} [requestId]
 * @property {string} [userId]
 * @property {number} [maxOutputTokens]
 * @property {string} [script]
 * @property {string} [route]
 * @property {string|null} [cacheHit]
 */

/**
 * @param {Partial<LlmCallContext>} [partial]
 * @returns {LlmCallContext}
 */
export function createLlmCallContext(partial = {}) {
  return {
    feature: partial.feature ?? 'unknown',
    agentName: partial.agentName ?? null,
    purpose: partial.purpose ?? null,
    promptId: partial.promptId ?? null,
    promptVersion: partial.promptVersion ?? null,
    schemaVersion: partial.schemaVersion ?? null,
    requestId: partial.requestId ?? randomUUID(),
    userId: partial.userId ?? null,
    maxOutputTokens: partial.maxOutputTokens ?? null,
    script: partial.script ?? null,
    route: partial.route ?? null,
    cacheHit: partial.cacheHit ?? null,
  };
}

/**
 * Merge partial context into base (for tool-loop rounds).
 * @param {LlmCallContext|undefined|null} base
 * @param {Partial<LlmCallContext>} patch
 */
export function mergeLlmCallContext(base, patch = {}) {
  const b = base ?? createLlmCallContext();
  return {
    ...b,
    ...patch,
    requestId: patch.requestId ?? b.requestId,
  };
}
