/**
 * Same-day digital quarantine persistence — block re-ingestion on re-assess.
 *
 * Pipeline position: post-partition — load prior quarantine before partition;
 * build new quarantine state after partition for assessment persistence.
 *
 * Owns: loadActiveQuarantine from prior report JSON, buildQuarantineState for same-day expiry.
 * Does NOT: partition signals or compute void index.
 *
 * Key collaborators: `dataVoid/scoringPartition.js`, report artifact paths,
 * cross-cut-modules/persistence state store.
 */

import { resolveStateStore } from '../../../../../cross-cut-modules/persistence/domain/resolveStateStore.js';

function getStore(deps = {}) {
  return resolveStateStore(deps);
}
import { join, resolve } from 'node:path';

import {
  normalizeReportScopeId,
} from '../../../../../cross-cut-modules/geo/reportScopeIds.js';
import { listReportJsonFilenamesForDate } from '../paths/reportNames.js';
import { resilienceReportsDir } from '../paths/outputDirs.js';

// ── Quarantine load ───────────────────────────────────────────────────────────

/**
 * End-of-UTC-day ISO timestamp for quarantine expiry.
 *
 * @param {string} dateIso YYYY-MM-DD
 * @returns {string}
 */
export function endOfUtcDayIso(dateIso) {
  const [y, m, d] = dateIso.split('-').map((s) => Number.parseInt(s, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
  return dt.toISOString();
}

/**
 * @param {string} reportsDir
 * @param {string} scopeId
 * @param {string} date
 */
function findLatestReportForDate(reportsDir, scopeId, date) {
  if (!getStore().existsSync(reportsDir)) return null;
  const files = listReportJsonFilenamesForDate(reportsDir, date, normalizeReportScopeId(scopeId));
  let best = null;
  let bestMtime = -1;
  for (const f of files) {
    const fullPath = join(reportsDir, f);
    let mtime;
    try { mtime = getStore().statSync(fullPath).mtimeMs; } catch { continue; }
    if (mtime > bestMtime) {
      bestMtime = mtime;
      best = fullPath;
    }
  }
  if (!best) return null;
  try {
    return JSON.parse(getStore().readFileSync(best, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Load active same-day digital quarantine from the latest report for date/scope.
 *
 * @param {string} date YYYY-MM-DD
 * @param {string} scopeId
 * @param {string} [reportsDir]
 * @returns {object|null}
 */
export function loadActiveQuarantine(date, scopeId, reportsDir = resilienceReportsDir()) {
  const dir = resolve(reportsDir);
  const parsed = findLatestReportForDate(dir, scopeId, date);
  const state = parsed?.assessment?.digital_quarantine_state ?? null;
  if (!state?.active) return null;

  const expires = state.expires ?? endOfUtcDayIso(date);
  // Expire by the quarantine's own timestamp regardless of whether `date` is
  // today. Otherwise a past-date replay would inherit a previous run's quarantine
  // forever (it never reaches the expiry check), permanently freezing digital
  // signals out of scoring. Same-day flip-flop protection is preserved because a
  // same-day quarantine has not yet passed its end-of-day expiry.
  if (Date.now() > Date.parse(expires)) return null;

  return state;
}

// ── Quarantine state build ──────────────────────────────────────────────────────

/**
 * Build digital_quarantine_state to persist when partition quarantines digital signals.
 *
 * @param {object} partition From resolveScoringPartition.
 * @param {object|null|undefined} dataVoid
 * @param {object} [opts]
 * @param {string} [opts.scopeId]
 * @param {string} [opts.reportDate]
 * @returns {object|null}
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
