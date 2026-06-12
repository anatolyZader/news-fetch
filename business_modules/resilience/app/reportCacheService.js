/**
 * Report cache service — loads persisted resilience assessments for the UI/API.
 * Production runs use `extract-signals` → `assess-signals` (see docs/main_docu_files/PIPELINE-AND-SOURCES.md).
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

import { getTodayInTimezone } from '../../../utils/dateUtils.js';
import {
  normalizeReportScopeId,
  reportFilePrefix,
} from '../../../cross-cut-modules/geo/reportScopeIds.js';
import { readCostBreakdownForDate as readCostBreakdownForDateFromLog } from '../../../cross-cut-modules/log/index.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function readCostBreakdownForDate(date) {
  return readCostBreakdownForDateFromLog(date, ROOT);
}

function reportPrefixForScope(scope = 'national') {
  return reportFilePrefix(normalizeReportScopeId(scope));
}

function resolveReportsDir(opts = {}) {
  if (opts.reportsDir) return opts.reportsDir;
  const fromEnv = process.env.REPORTS_DIR?.trim();
  if (fromEnv) return isAbsolute(fromEnv) ? fromEnv : resolve(ROOT, fromEnv);
  return resolve(ROOT, 'daily_reports');
}

function readAssessmentTotalArticles(jsonPath) {
  try {
    const raw = readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    const n = parsed?.assessment?.total_articles_analyzed;
    return typeof n === 'number' && Number.isFinite(n) ? n : 0;
  } catch {
    return -1;
  }
}

/**
 * Prefer `resilience-report-{date}.json`; else best `resilience-report-{date}-*.json` (CLI runs add HHMM).
 * When several timestamped files exist for the same day, prefer the one with the largest
 * `assessment.total_articles_analyzed` (full merge beats a later slim/audio-only run); tie-break on newest mtime.
 * @param {string} date YYYY-MM-DD
 * @param {{ reportsDir?: string, scope?: 'national'|'north' }} [opts] `reportsDir` overrides the default `daily_reports/` (for tests).
 * @returns {string | null} absolute path
 */
export function resolveReportJsonPathForDate(date, opts = {}) {
  const reportsDir = opts.reportsDir ?? resolve(ROOT, 'daily_reports');
  const prefixBase = reportPrefixForScope(opts.scope);
  if (!existsSync(reportsDir)) return null;

  const exact = resolve(reportsDir, `${prefixBase}-${date}.json`);
  if (existsSync(exact)) return exact;

  const prefix = `${prefixBase}-${date}-`;
  let names;
  try {
    names = readdirSync(reportsDir);
  } catch {
    return null;
  }

  const candidates = names.filter((f) => f.startsWith(prefix) && f.endsWith('.json'));
  if (candidates.length === 0) return null;

  let bestPath = null;
  let bestArticles = -Infinity;
  let bestMtime = -1;
  for (const f of candidates) {
    const p = join(reportsDir, f);
    try {
      const articles = readAssessmentTotalArticles(p);
      const m = statSync(p).mtimeMs;
      if (
        articles > bestArticles ||
        (articles === bestArticles && m > bestMtime)
      ) {
        bestArticles = articles;
        bestMtime = m;
        bestPath = p;
      }
    } catch {
      /* skip */
    }
  }
  return bestPath;
}

/**
 * Read the assessment metadata block from a report JSON file.
 * @param {string} jsonPath
 * @returns {object|null}
 */
export function readAssessmentReportMeta(jsonPath) {
  try {
    const parsed = JSON.parse(readFileSync(jsonPath, 'utf8'));
    return parsed?.assessment ?? null;
  } catch {
    return null;
  }
}

/**
 * Rank a report's quality: 0 = normal (do not overwrite), >0 = degraded (safe to overwrite).
 * @param {object|null} meta
 * @returns {number}
 */
export function reportQualityRank(meta) {
  if (!meta) return 1;
  if (meta.digital_quarantine_state?.active) return 2;
  if (meta.assessment_mode && meta.assessment_mode !== 'normal') return 1;
  return 0;
}

/**
 * Return today's cached report payload `{ assessment, signals?, markdown?, ... }`, or null if none exists.
 *
 * **Filesystem first:** the best `resilience-report-{date}-*.json` under `daily_reports/` (highest
 * `total_articles_analyzed`, then newest mtime; sibling `.md` loaded when present) is the canonical rich export.
 * SQLite is used only when no JSON exists for that date.
 *
 * @param {import('../../../db/persistence/evidenceStore.js').ReturnType<createEvidenceStore>} [store]
 * @param {{ scope?: 'national'|'north' }} [opts]
 */
export function getCachedReport(store, opts = {}) {
  const timezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';
  const today = getTodayInTimezone(timezone);
  const scope = normalizeReportScopeId(opts.scope);
  const reportsDir = resolveReportsDir(opts);

  const todayResult = _loadReportForDate(today, store, { scope, reportsDir });
  if (todayResult) return { ...todayResult, reportDate: today };

  const fallback = _findLatestAvailableReport(today, store, { scope, reportsDir });
  if (fallback) return fallback;

  return null;
}

/** Load markdown sidecar files adjacent to a report JSON path. */
function _readMarkdownSidecars(jsonPath) {
  const mdPath = jsonPath.replace(/\.json$/i, '.md');
  const briefMdPath = jsonPath.replace(/\.json$/i, '-brief.md');
  let markdown = null;
  let markdown_brief = null;
  if (existsSync(mdPath)) {
    try {
      markdown = readFileSync(mdPath, 'utf8');
    } catch {
      /* ignore */
    }
  }
  if (existsSync(briefMdPath)) {
    try {
      markdown_brief = readFileSync(briefMdPath, 'utf8');
    } catch {
      /* ignore */
    }
  }
  return { markdown, markdown_brief };
}

/** Load a report for a specific date from filesystem or store. Returns payload or null. */
function _loadReportForDate(date, store, { scope = 'national', reportsDir } = {}) {
  const jsonPath = resolveReportJsonPathForDate(date, { scope, reportsDir });
  if (jsonPath && existsSync(jsonPath)) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    } catch {
      return null;
    }
    const { markdown, markdown_brief } = _readMarkdownSidecars(jsonPath);
    const costBreakdown = readCostBreakdownForDate(date);
    return {
      ...parsed,
      markdown,
      ...(markdown_brief ? { markdown_brief } : {}),
      ...(costBreakdown ? { costBreakdown } : {}),
    };
  }

  if (scope === 'national' && store) {
    const run = store.getLatestRunForDate(date);
    if (run) {
      const costBreakdown = readCostBreakdownForDate(date);
      return {
        assessment: run.reportJson,
        markdown: run.reportMd ?? null,
        ...(costBreakdown ? { costBreakdown } : {}),
      };
    }
  }

  return null;
}

/** Scan the reports directory for the most recent report before `today`. */
function _findLatestAvailableReport(today, store, { scope = 'national', reportsDir } = {}) {
  const dir = reportsDir ?? resolveReportsDir();
  if (!existsSync(dir)) return null;

  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }

  const escapedPrefix = reportPrefixForScope(scope).replaceAll(REGEX_SPECIAL_CHARS, String.raw`\$&`);
  const datePattern = new RegExp(String.raw`^${escapedPrefix}-(\d{4}-\d{2}-\d{2})`);
  const dates = [...new Set(
    names
      .map((f) => datePattern.exec(f)?.[1])
      .filter((d) => d && d < today),
  )].sort((a, b) => a.localeCompare(b));

  for (let i = dates.length - 1; i >= 0; i--) {
    const date = dates[i];
    const result = _loadReportForDate(date, store, { scope, reportsDir: dir });
    if (result) return { ...result, reportDate: date };
  }

  return null;
}
