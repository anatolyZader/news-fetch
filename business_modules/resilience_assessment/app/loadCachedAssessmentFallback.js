/**
 * Cached report fallback when deterministic assessment cannot run (empty scores).
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { reportFilePrefix } from '../../../cross-cut-modules/geo/reportScopeIds.js';
import { resolveReportJsonPathForDate } from '../../resilience/index.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

function defaultReportsDir(override) {
  if (override) return override;
  const fromEnv = process.env.REPORTS_DIR?.trim();
  if (fromEnv) return fromEnv.startsWith('/') ? fromEnv : resolve(ROOT, fromEnv);
  return resolve(ROOT, 'daily_reports');
}

/**
 * Find the most recent report date before targetDate for scope.
 * @param {string} targetDate YYYY-MM-DD
 * @param {string} reportScopeId
 * @param {string} reportsDir
 * @returns {string|null}
 */
function findLatestReportDateBefore(targetDate, reportScopeId, reportsDir) {
  if (!existsSync(reportsDir)) return null;
  let names;
  try {
    names = readdirSync(reportsDir);
  } catch {
    return null;
  }
  const escapedPrefix = reportFilePrefix(reportScopeId).replaceAll(REGEX_SPECIAL_CHARS, String.raw`\$&`);
  const datePattern = new RegExp(String.raw`^${escapedPrefix}-data-(\d{4}-\d{2}-\d{2})-run-`);
  const dates = [...new Set(
    names
      .map((f) => datePattern.exec(f)?.[1])
      .filter((d) => d && d < targetDate),
  )].sort((a, b) => a.localeCompare(b));
  return dates.length > 0 ? dates.at(-1) : null;
}

/**
 * @param {string} jsonPath
 * @returns {object|null}
 */
function readReportAssessment(jsonPath) {
  try {
    const raw = readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed?.assessment ?? parsed;
  } catch {
    return null;
  }
}

/**
 * @param {object} assessment
 * @param {string} cachedDate
 * @param {string} reportPath
 * @param {string} degradeReason
 * @param {boolean} stale
 */
function annotateCached(assessment, cachedDate, reportPath, degradeReason, stale) {
  const out = {
    ...assessment,
    assessment_degraded: {
      mode: 'cached',
      reason: degradeReason,
      cached_date: cachedDate,
      stale,
    },
    degrade_reason: degradeReason,
    synthesis_mode: assessment.synthesis_mode ?? 'cached',
    agent_trace_id: assessment.agent_trace_id ?? null,
  };
  return {
    assessment: out,
    cachedDate,
    reportPath,
  };
}

/**
 * Load cached assessment for degrade ladder tier 3.
 *
 * @param {object} params
 * @param {string} params.targetDate YYYY-MM-DD
 * @param {string} [params.reportScopeId]
 * @param {string} [params.reportsDir]
 * @param {string} [params.degradeReason]
 * @returns {{ assessment: object, cachedDate: string, reportPath: string } | null}
 */
export function loadCachedAssessmentFallback(params) {
  const {
    targetDate,
    reportScopeId = 'national',
    reportsDir = defaultReportsDir(params.reportsDir),
    degradeReason = 'empty_scores',
  } = params;

  const sameDayPath = resolveReportJsonPathForDate(targetDate, { scope: reportScopeId, reportsDir });
  if (sameDayPath) {
    const assessment = readReportAssessment(sameDayPath);
    if (assessment?.components?.length) {
      return annotateCached(assessment, targetDate, sameDayPath, degradeReason, false);
    }
  }

  const priorDate = findLatestReportDateBefore(targetDate, reportScopeId, reportsDir);
  if (!priorDate) return null;

  const priorPath = resolveReportJsonPathForDate(priorDate, { scope: reportScopeId, reportsDir });
  if (!priorPath) return null;

  const assessment = readReportAssessment(priorPath);
  if (!assessment?.components?.length) return null;

  return annotateCached(assessment, priorDate, priorPath, degradeReason, true);
}
