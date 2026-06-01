/**
 * Persist operator recommendation acknowledge/dismiss on report JSON.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolveReportJsonPathForDate } from '../../../api/analysisService.js';

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

  const now = new Date().toISOString();
  const rec = { ...recs[idx] };
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
