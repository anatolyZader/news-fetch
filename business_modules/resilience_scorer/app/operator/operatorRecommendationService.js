/**
 * Parse and validate operator recommendation requests; query pending recommendations.
 */
import { normalizeReportScope } from '../../domain/services/signals/regionSignalFilter.js';
import { parseRecommendationAction } from '../../domain/value_objects/recommendationAction.js';

/**
 * @param {{ id?: string, scope?: string, date?: string, action?: string, rationale?: string }} input
 * @returns {{ ok: true, recommendationId: string, scope: string, reportDate: string, action: 'acknowledge'|'dismiss', rationale: string } | { ok: false, error: string, statusCode: number }}
 */
export function parseOperatorRecommendationRequest(input = {}) {
  const recommendationId = String(input.id ?? '').trim();
  const scope = normalizeReportScope(input.scope ?? 'national');
  const reportDate = String(input.date ?? '').trim();
  const action = parseRecommendationAction(input.action ?? 'acknowledge');
  const rationale = String(input.rationale ?? '').trim();

  if (!recommendationId) {
    return { ok: false, error: 'recommendation id required', statusCode: 400 };
  }
  if (!action) {
    return { ok: false, error: 'action must be acknowledge or dismiss', statusCode: 400 };
  }

  return { ok: true, recommendationId, scope, reportDate, action, rationale };
}

/**
 * @param {object} assessment
 * @returns {Array<object>}
 */
export function pendingOperatorRecommendations(assessment) {
  return (assessment?.operator_recommendations ?? []).filter((r) => r.status === 'pending');
}
