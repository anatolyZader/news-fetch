/**
 * Validation explain/agent daily LLM quota (SQLite-backed).
 */
import { canRunAnalysisDisplay } from '../../auth/userAccess.js';

export const VALIDATION_LLM_CHANNELS = Object.freeze({
  explain: 'validation_explain',
  agent: 'validation_agent',
});

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function dailyLimitForChannel(channel) {
  if (channel === VALIDATION_LLM_CHANNELS.agent) {
    const raw = process.env.VALIDATION_AGENT_DAILY_LIMIT ?? process.env.VALIDATION_LLM_DAILY_LIMIT ?? '20';
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 20;
  }
  const raw = process.env.VALIDATION_EXPLAIN_DAILY_LIMIT ?? process.env.VALIDATION_LLM_DAILY_LIMIT ?? '40';
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 40;
}

/**
 * @param {import('fastify').FastifyRequest} request
 * @param {ReturnType<import('../../persistence/llmDailyQuotaStore.js').createLlmDailyQuotaStore>|null} quotaStore
 * @param {string} channel
 */
export function canRunValidationLlm(request, quotaStore, channel) {
  if (canRunAnalysisDisplay(request.user?.email)) return true;
  if (!quotaStore) return true;
  const limit = dailyLimitForChannel(channel);
  const uid = request.user?.uid ?? 'anonymous';
  const used = quotaStore.getDailyCount(uid, todayKey(), channel);
  return used < limit;
}

/**
 * @param {import('fastify').FastifyRequest} request
 * @param {ReturnType<import('../../persistence/llmDailyQuotaStore.js').createLlmDailyQuotaStore>|null} quotaStore
 * @param {string} channel
 */
export function recordValidationLlmUsage(request, quotaStore, channel) {
  if (!quotaStore) return;
  const uid = request.user?.uid ?? 'anonymous';
  quotaStore.incrementDailyCount(uid, todayKey(), channel);
}

/**
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @param {ReturnType<import('../../persistence/llmDailyQuotaStore.js').createLlmDailyQuotaStore>|null} quotaStore
 * @param {string} channel
 * @returns {boolean}
 */
export function requireValidationLlmAccess(request, reply, quotaStore, channel) {
  if (canRunValidationLlm(request, quotaStore, channel)) return true;
  const limit = dailyLimitForChannel(channel);
  reply.code(403).send({
    error: 'Forbidden',
    code: 'validation_llm_quota_exceeded',
    message: `Daily validation LLM quota exceeded for ${channel} (limit: ${limit}).`,
  });
  return false;
}
