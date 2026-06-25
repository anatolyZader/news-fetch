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
import { inferAssessmentWindowFromSourceFiles } from '../app/assessSignalsHelpers.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function readCostBreakdownForDate(date) {
  return readCostBreakdownForDateFromLog(date, ROOT);
}

/**
 * @param {string | null} candidateAt
 * @param {string | null} bestAt
 * @returns {boolean | null} true if candidate wins, false if best wins, null if tie
 */
function compareGeneratedAt(candidateAt, bestAt) {
  if (candidateAt && bestAt) {
    if (candidateAt > bestAt) return true;
    if (candidateAt < bestAt) return false;
    return null;
  }
  if (candidateAt && !bestAt) return true;
  if (!candidateAt && bestAt) return false;
  return null;
}

/**
 * @param {{ critical: boolean, generatedAt: string | null, articles: number }} meta
 * @param {number} mtimeMs
 * @param {{ critical: boolean, generatedAt: string | null, articles: number, mtime: number }} best
 */
function isBetterReportCandidate(meta, mtimeMs, best) {
  if (meta.critical && !best.critical) return true;
  if (!meta.critical && best.critical) return false;
  const generatedAtWinner = compareGeneratedAt(meta.generatedAt, best.generatedAt);
  if (generatedAtWinner != null) return generatedAtWinner;
  if (meta.articles > best.articles) return true;
  if (meta.articles < best.articles) return false;
  return mtimeMs > best.mtime;
}

function reportPrefixForScope(scope = 'national') {
  return reportFilePrefix(normalizeReportScopeId(scope));
}

function reportFilePatternForScope(scope = 'national') {
  const escapedPrefix = reportPrefixForScope(scope).replaceAll(REGEX_SPECIAL_CHARS, String.raw`\$&`);
  return new RegExp(String.raw`^${escapedPrefix}-(\d{4}-\d{2}-\d{2})(?:-(\d{4}))?\.json$`);
}

/**
 * @param {string} filename
 * @param {string} [scope]
 * @returns {string | null | undefined} run_id suffix, null for exact file, undefined if no match
 */
export function parseReportRunIdFromFilename(filename, scope = 'national') {
  const m = reportFilePatternForScope(scope).exec(filename);
  if (!m) return undefined;
  return m[2] ?? null;
}

/**
 * Compare two report candidates; positive when `a` outranks `b`.
 * @param {{ critical: boolean, generatedAt: string | null, articles: number }} metaA
 * @param {number} mtimeA
 * @param {{ critical: boolean, generatedAt: string | null, articles: number }} metaB
 * @param {number} mtimeB
 */
export function compareReportCandidates(metaA, mtimeA, metaB, mtimeB) {
  if (isBetterReportCandidate(metaA, mtimeA, { ...metaB, mtime: mtimeB })) {
    if (isBetterReportCandidate(metaB, mtimeB, { ...metaA, mtime: mtimeA })) return 0;
    return -1;
  }
  return 1;
}

/**
 * All report JSON paths for a date (exact + suffixed), not just the winner.
 * @param {string} date YYYY-MM-DD
 * @param {{ reportsDir?: string, scope?: string }} [opts]
 * @returns {string[]}
 */
export function listReportJsonPathsForDate(date, opts = {}) {
  const reportsDir = opts.reportsDir ?? resolveReportsDir(opts);
  const prefixBase = reportPrefixForScope(opts.scope);
  if (!existsSync(reportsDir)) return [];

  const paths = [];
  const exact = resolve(reportsDir, `${prefixBase}-${date}.json`);
  if (existsSync(exact)) paths.push(exact);

  const prefix = `${prefixBase}-${date}-`;
  let names;
  try {
    names = readdirSync(reportsDir);
  } catch {
    return paths;
  }

  for (const f of names) {
    if (f.startsWith(prefix) && f.endsWith('.json')) {
      paths.push(join(reportsDir, f));
    }
  }
  return paths;
}

function resolveReportsDir(opts = {}) {
  if (opts.reportsDir) return opts.reportsDir;
  const fromEnv = process.env.REPORTS_DIR?.trim();
  if (fromEnv) return isAbsolute(fromEnv) ? fromEnv : resolve(ROOT, fromEnv);
  return resolve(ROOT, 'daily_reports');
}

function readReportMeta(jsonPath) {
  try {
    const raw = readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    const articles = parsed?.assessment?.total_articles_analyzed;
    const critical = parsed?.assessment?.critical_signal === true;
    // generated_at is a top-level ISO string written by reportWriter.js
    const generatedAt = typeof parsed?.generated_at === 'string' ? parsed.generated_at : null;
    return {
      articles: typeof articles === 'number' && Number.isFinite(articles) ? articles : 0,
      critical,
      generatedAt,
      assessmentWindow: parsed?.assessment_window ?? null,
      sourceFiles: Array.isArray(parsed?.source_files) ? parsed.source_files : [],
      reportDate: typeof parsed?.assessment?.date === 'string' ? parsed.assessment.date : null,
    };
  } catch {
    return {
      articles: -1,
      critical: false,
      generatedAt: null,
      assessmentWindow: null,
      sourceFiles: [],
      reportDate: null,
    };
  }
}

/**
 * Resolve edition window fields from persisted metadata or legacy source_files inference.
 * @param {string} date
 * @param {object} meta from readReportMeta
 */
function resolveEditionWindow(date, meta) {
  const aw = meta.assessmentWindow;
  if (aw && typeof aw === 'object') {
    return {
      assessment_days: typeof aw.days === 'number' ? aw.days : null,
      window_start: typeof aw.window_start === 'string' ? aw.window_start : null,
      window_end: typeof aw.window_end === 'string' ? aw.window_end : null,
    };
  }
  const inferred = inferAssessmentWindowFromSourceFiles(date, meta.sourceFiles);
  if (!inferred) {
    return { assessment_days: null, window_start: null, window_end: null };
  }
  return inferred;
}

/**
 * Prefer `resilience-report-{date}.json`; else best `resilience-report-{date}-*.json` (CLI runs add HHMM).
 * Selection priority for same-day timestamped files:
 *   1. `assessment.critical_signal === true` always wins (emergency re-runs).
 *   2. Newest `generated_at` ISO timestamp (written top-level by reportWriter.js).
 *   3. Largest `assessment.total_articles_analyzed` (full merge beats slim/audio-only run).
 *   4. Newest filesystem mtime as final tiebreaker.
 * @param {string} date YYYY-MM-DD
 * @param {{ reportsDir?: string, scope?: 'national'|'north', runId?: string | null }} [opts]
 * @returns {string | null} absolute path
 */
export function resolveReportJsonPathForDate(date, opts = {}) {
  const reportsDir = opts.reportsDir ?? resolve(ROOT, 'daily_reports');
  const prefixBase = reportPrefixForScope(opts.scope);
  if (!existsSync(reportsDir)) return null;

  const runId = opts.runId;
  if (typeof runId === 'string' && runId.length > 0) {
    const specific = resolve(reportsDir, `${prefixBase}-${date}-${runId}.json`);
    return existsSync(specific) ? specific : null;
  }

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
  const best = {
    critical: false,
    generatedAt: null,
    articles: -Infinity,
    mtime: -1,
  };

  for (const f of candidates) {
    const p = join(reportsDir, f);
    try {
      const meta = readReportMeta(p);
      const m = statSync(p).mtimeMs;
      if (isBetterReportCandidate(meta, m, best)) {
        best.critical = meta.critical;
        best.generatedAt = meta.generatedAt;
        best.articles = meta.articles;
        best.mtime = m;
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
 * @param {{ scope?: 'national'|'north', date?: string, runId?: string | null }} [opts]
 */
export function getCachedReport(store, opts = {}) {
  const timezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';
  const today = getTodayInTimezone(timezone);
  const scope = normalizeReportScopeId(opts.scope);
  const reportsDir = resolveReportsDir(opts);
  const loadOpts = { scope, reportsDir, runId: opts.runId };

  // If a specific date is requested, load exactly that date (no fallback).
  if (opts.date && /^\d{4}-\d{2}-\d{2}$/.test(opts.date)) {
    const result = _loadReportForDate(opts.date, store, loadOpts);
    return result ? { ...result, reportDate: opts.date } : null;
  }

  const todayResult = _loadReportForDate(today, store, loadOpts);
  if (todayResult) return { ...todayResult, reportDate: today };

  const fallback = _findLatestAvailableReport(today, store, { scope, reportsDir });
  if (fallback) return fallback;

  return null;
}

/**
 * Return all dates that have a report for the given scope, newest first.
 * @param {{ scope?: 'national'|'north', reportsDir?: string }} [opts]
 * @returns {string[]} YYYY-MM-DD strings, newest first
 */
export function getAvailableReportDates(opts = {}) {
  const editions = getAvailableReportEditions(opts);
  return [...new Set(editions.map((e) => e.date))].sort((a, b) => b.localeCompare(a));
}

/**
 * Return rich edition metadata for each date that has a report for the given scope.
 * @param {{ scope?: 'national'|'north', reportsDir?: string }} [opts]
 */
export function getAvailableReportEditions(opts = {}) {
  const scope = normalizeReportScopeId(opts.scope);
  const dir = opts.reportsDir ?? resolveReportsDir();
  const timezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';
  const today = getTodayInTimezone(timezone);
  if (!existsSync(dir)) return [];

  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }

  const filePattern = reportFilePatternForScope(scope);
  /** @type {Array<{ date: string, run_id: string | null, jsonPath: string, meta: ReturnType<typeof readReportMeta>, mtime: number }>} */
  const candidates = [];

  for (const f of names) {
    const m = filePattern.exec(f);
    if (!m) continue;
    const date = m[1];
    const run_id = m[2] ?? null;
    const jsonPath = join(dir, f);
    let mtime;
    try {
      mtime = statSync(jsonPath).mtimeMs;
    } catch {
      continue;
    }
    candidates.push({
      date,
      run_id,
      jsonPath,
      meta: readReportMeta(jsonPath),
      mtime,
    });
  }

  candidates.sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    return compareReportCandidates(a.meta, a.mtime, b.meta, b.mtime);
  });

  return candidates.map(({ date, run_id, meta }) => {
    const windowFields = resolveEditionWindow(date, meta);
    return {
      date,
      run_id,
      generated_at: meta.generatedAt,
      assessment_days: windowFields.assessment_days,
      window_start: windowFields.window_start,
      window_end: windowFields.window_end,
      total_articles: meta.articles >= 0 ? meta.articles : null,
      is_today: date === today,
    };
  });
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
function _loadReportForDate(date, store, { scope = 'national', reportsDir, runId } = {}) {
  const jsonPath = resolveReportJsonPathForDate(date, { scope, reportsDir, runId });
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
