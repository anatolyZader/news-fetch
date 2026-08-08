/**
 * Persist user recommendation acknowledge/dismiss on report JSON.
 */
import { readFileSync } from 'node:fs';

import { writeFileAtomicSync } from '../../../cross-cut-modules/persistence/infrastructure/writeFileAtomic.js';
import { createKeyedMutex } from '../../../cross-cut-modules/persistence/infrastructure/keyedMutex.js';
import { resolveReportJsonPathForDate } from './reportCacheService.js';

const reportFileMutex = createKeyedMutex();

/**
 * @param {string} reportDate YYYY-MM-DD
 * @param {string} scope
 * @param {string} recommendationId
 * @param {{ action: 'acknowledge'|'dismiss', userEmail?: string|null, rationale?: string }} update
 * @param {{ reportsDir?: string }} [opts]
 */
export async function updateUserRecommendationStatus(
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
  // Read-modify-write on a shared report file: serialize per path so
  // concurrent acknowledges cannot drop each other's update.
  return reportFileMutex.runExclusive(jsonPath, () =>
    applyRecommendationUpdate(jsonPath, recommendationId, update));
}

/**
 * @param {string} jsonPath
 * @param {string} recommendationId
 * @param {{ action: 'acknowledge'|'dismiss', userEmail?: string|null, rationale?: string }} update
 */
function applyRecommendationUpdate(jsonPath, recommendationId, update) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch {
    return { ok: false, error: 'report_read_failed' };
  }

  const assessment = parsed.assessment ?? parsed;
  const recs = assessment.user_recommendations ?? [];
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
  assessment.user_recommendations = recs;
  if (parsed.assessment) parsed.assessment = assessment;
  else Object.assign(parsed, assessment);

  try {
    writeFileAtomicSync(jsonPath, `${JSON.stringify(parsed, null, 2)}\n`);
  } catch {
    return { ok: false, error: 'report_write_failed' };
  }

  return { ok: true, recommendation: rec };
}
