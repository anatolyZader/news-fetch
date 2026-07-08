/**
 * Persist operator recommendation acknowledge/dismiss on report JSON.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { normalizeReportScope } from '../../domain/services/regionSignalFilter.js';
import { parseRecommendationAction } from '../../domain/value_objects/recommendationAction.js';
import { resolveReportJsonPathForDate } from './reportCacheService.js';

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
 * @param {string} reportDate YYYY-MM-DD
 * @param {string} scope
 * @param {string} recommendationId
 * @param {{ action: 'acknowledge'|'dismiss', userEmail?: string|null, rationale?: string }} update
 * @param {{ reportsDir?: string }} [opts]
 */
export function updateOperatorRecommendationStatus(
  reportDate,
  scope,
  recommendationId,
  update,
  opts = {},
) {
  const jsonPath = resolveReportJsonPathForDate(reportDate, { scope, reportsDir: opts.reportsDir });
  if (!jsonPath) {
    return { ok: false, error: 'report_not_found' };
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch {
    return { ok: false, error: 'report_read_failed' };
  }

  const assessment = parsed.assessment ?? parsed;
  const recs = assessment.operator_recommendations ?? [];
  const idx = recs.findIndex((r) => r.id === recommendationId);
  if (idx < 0) {
    return { ok: false, error: 'recommendation_not_found' };
  }

  const existing = recs[idx];
  if (update.action === 'acknowledge' && existing.status === 'acknowledged') {
    return { ok: true, recommendation: existing };
  }
  if (update.action === 'dismiss' && existing.status === 'dismissed') {
    return { ok: true, recommendation: existing };
  }

  const now = new Date().toISOString();
  const rec = { ...existing };
  if (update.action === 'acknowledge') {
    rec.status = 'acknowledged';
    rec.acknowledged_at = now;
    rec.acknowledged_by = update.userEmail ?? null;
    rec.acknowledge_rationale = update.rationale ?? null;
  } else if (update.action === 'dismiss') {
    rec.status = 'dismissed';
    rec.acknowledged_at = now;
    rec.acknowledged_by = update.userEmail ?? null;
    rec.dismiss_reason = update.rationale ?? null;
  } else {
    return { ok: false, error: 'invalid_action' };
  }

  recs[idx] = rec;
  assessment.operator_recommendations = recs;
  if (parsed.assessment) parsed.assessment = assessment;
  else Object.assign(parsed, assessment);

  try {
    writeFileSync(jsonPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  } catch {
    return { ok: false, error: 'report_write_failed' };
  }

  return { ok: true, recommendation: rec };
}

/**
 * @param {object} assessment
 * @returns {Array<object>}
 */
export function pendingOperatorRecommendations(assessment) {
  return (assessment?.operator_recommendations ?? []).filter((r) => r.status === 'pending');
}
