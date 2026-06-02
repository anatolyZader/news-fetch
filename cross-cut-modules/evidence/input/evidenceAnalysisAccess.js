/**
 * Evidence submission LLM analysis access gate (SQLite-backed daily quota).
 */

import { canRunAnalysisDisplay } from '../../auth/userAccess.js';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * @param {import('fastify').FastifyRequest} request
 * @param {{ getDailyAnalysisCount?: (ownerKey: string, day: string) => number } | null} quotaStore
 * @returns {boolean}
 */
export function canRunEvidenceLlmAnalysis(request, quotaStore = null) {
  if (canRunAnalysisDisplay(request.user?.email)) {
    return true;
  }
  const limitRaw = process.env.EVIDENCE_ANALYSIS_DAILY_LIMIT;
  if (limitRaw == null || limitRaw === '') {
    return false;
  }
  const limit = Number.parseInt(limitRaw, 10);
  if (!Number.isFinite(limit) || limit <= 0) {
    return false;
  }
  const uid = request.user?.uid ?? 'anonymous';
  const day = todayKey();
  const used = quotaStore?.getDailyAnalysisCount?.(uid, day) ?? 0;
  return used < limit;
}

/**
 * @param {import('fastify').FastifyRequest} request
 * @param {{ incrementDailyAnalysisCount?: (ownerKey: string, day: string) => void } | null} quotaStore
 */
export function recordEvidenceLlmAnalysis(request, quotaStore = null) {
  const uid = request.user?.uid ?? 'anonymous';
  quotaStore?.incrementDailyAnalysisCount?.(uid, todayKey());
}

/**
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @param {{ getDailyAnalysisCount?: (ownerKey: string, day: string) => number } | null} quotaStore
 * @returns {boolean}
 */
export function requireEvidenceLlmAnalysisAccess(request, reply, quotaStore = null) {
  if (canRunEvidenceLlmAnalysis(request, quotaStore)) {
    return true;
  }
  reply.code(403).send({
    error: 'Forbidden',
    code: 'evidence_analysis_denied',
    message:
      'LLM evidence analysis requires maintainer access or an available daily quota (EVIDENCE_ANALYSIS_DAILY_LIMIT).',
  });
  return false;
}
