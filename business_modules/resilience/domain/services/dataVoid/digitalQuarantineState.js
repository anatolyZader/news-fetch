/**
 * Same-day digital quarantine persistence — block re-ingestion on re-assess.
 */

import { getDefaultStateStore } from '../../../../../cross-cut-modules/persistence/infrastructure/fsStateStoreAdapter.js';
const stateStore = getDefaultStateStore();
import { join, resolve } from 'node:path';

import {
  normalizeReportScopeId,
  reportFilePrefix,
} from '../../../../../cross-cut-modules/geo/reportScopeIds.js';

/**
 * @param {string} dateIso YYYY-MM-DD
 */
export function endOfUtcDayIso(dateIso) {
  const [y, m, d] = dateIso.split('-').map((s) => Number.parseInt(s, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
  return dt.toISOString();
}

/**
 * @param {string} prefix
 */
function escapeRegExpPrefix(prefix) {
  return prefix.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * @param {string} reportsDir
 * @param {string} scopeId
 * @param {string} date
 */
function findLatestReportForDate(reportsDir, scopeId, date) {
  if (!stateStore.existsSync(reportsDir)) return null;
  const prefix = reportFilePrefix(normalizeReportScopeId(scopeId));
  const pattern = new RegExp(
    String.raw`^${escapeRegExpPrefix(prefix)}-${date}(?:-(\d{4}))?\.json$`,
  );
  let best = null;
  let bestMtime = -1;
  for (const f of stateStore.readdirSync(reportsDir)) {
    if (!pattern.test(f)) continue;
    const fullPath = join(reportsDir, f);
    let mtime;
    try { mtime = stateStore.statSync(fullPath).mtimeMs; } catch { continue; }
    if (mtime > bestMtime) {
      bestMtime = mtime;
      best = fullPath;
    }
  }
  if (!best) return null;
  try {
    return JSON.parse(stateStore.readFileSync(best, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {string} date YYYY-MM-DD
 * @param {string} scopeId
 * @param {string} [reportsDir]
 * @returns {object|null}
 */
export function loadActiveQuarantine(date, scopeId, reportsDir = 'daily_reports') {
  const dir = resolve(reportsDir);
  const parsed = findLatestReportForDate(dir, scopeId, date);
  const state = parsed?.assessment?.digital_quarantine_state ?? null;
  if (!state?.active) return null;

  const expires = state.expires ?? endOfUtcDayIso(date);
  if (Date.now() > Date.parse(expires)) return null;

  return state;
}

/**
 * @param {object} partition from resolveScoringPartition
 * @param {object|null|undefined} dataVoid
 * @param {object} [opts]
 * @param {string} [opts.scopeId]
 * @param {string} [opts.reportDate]
 */
export function buildQuarantineState(partition, dataVoid, opts = {}) {
  if (!partition?.partitionApplied) return null;
  if (partition.assessmentMode === 'normal') return null;

  const quarantinedCount = partition.quarantinedSignals?.length ?? 0;
  const reason = partition.quarantineReason ?? dataVoid?.reason ?? null;
  const shouldPersist = quarantinedCount > 0
    || partition.assessmentMode === 'field_anchor_only'
    || partition.assessmentMode === 'abstained';

  if (!shouldPersist) return null;

  const reportDate = opts.reportDate ?? new Date().toISOString().slice(0, 10);

  return {
    active: true,
    reason,
    since: new Date().toISOString(),
    scope: opts.scopeId ?? 'national',
    quarantined_count: quarantinedCount,
    assessment_mode: partition.assessmentMode,
    expires: endOfUtcDayIso(reportDate),
  };
}
