/**
 * Contested components require adversarial retrieval before submit.
 */
import { contestedAdversarialEnabled } from '../../../../cross-cut-modules/agent/agentConfig.js';

/**
 * @param {object} ep — epistemicProfile.by_component[componentId]
 * @param {'A'|'B'|'C'} tier
 */
export function requiresAdversarialRetrieval(ep, tier = 'A') {
  if (!contestedAdversarialEnabled()) return false;
  if (tier !== 'A') return false;
  return ep?.contested === true;
}

/**
 * @param {object} toolCtx — specialist tool context (mutated)
 * @param {string} toolName
 * @param {object} input
 */
export function trackAdversarialRetrieval(toolCtx, toolName, input) {
  if (toolName !== 'retrieve_for_claim') return;
  const polarity = input?.polarity ?? 'both';
  if (polarity === 'both' || polarity === 'contradict') {
    toolCtx.adversarialRetrievalDone = true;
  }
}

/**
 * @param {object} toolCtx
 * @returns {string|null} error JSON or null if ok
 */
export function validateAdversarialBeforeSubmit(toolCtx) {
  if (!toolCtx.adversarialRetrievalRequired) return null;
  if (toolCtx.adversarialRetrievalDone) return null;
  return JSON.stringify({
    error: 'contested_requires_adversarial_retrieval',
    hint: 'Call retrieve_for_claim with polarity "both" or "contradict" before submit_component_assessment.',
  });
}

export function adversarialSystemHint(ep) {
  if (!contestedAdversarialEnabled() || !ep?.contested) return '';
  return '\nCONTESTED: you MUST call retrieve_for_claim with polarity "both" for the main claim before submitting.\n';
}
