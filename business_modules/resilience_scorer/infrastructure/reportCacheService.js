/**
 * Report cache service — loads persisted resilience assessments for the UI/API.
 * Production runs use `extract-signals` → `assess-signals` (see docs/main_docu_files/PIPELINE-AND-SOURCES.md).
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getTodayInTimezone } from '../../../utils/dateUtils.js';
import {
  normalizeReportScopeId,
} from '../../../cross-cut-modules/geo/reportScopeIds.js';
import {
  parseReportFilename,
  resolveSpecificReportJsonPath,
  resolveSpecificReportMdPath,
  listReportJsonFilenamesForDate,
  listReportMdFilenamesForDate,
} from '../domain/services/paths/reportNames.js';
import { readCostBreakdownForDate as readCostBreakdownForDateFromLog } from '../../../cross-cut-modules/log/index.js';
import { inferAssessmentWindowFromSourceFiles } from '../domain/services/paths/assessmentWindow.js';
import { resilienceReportsDir } from '../domain/services/paths/outputDirs.js';
import {
  getDirNamesCached,
  getParsedReportCached,
  getReportMetaCached,
} from './reportFileCache.js';

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
 * Serve-best heuristic: critical flag → generatedAt → articles → mtime.
 * Intentionally different from reportHistoryReader.pickBestReportRecord, which
 * ignores critical/generatedAt so trend history is not skewed by critical re-runs.
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

function reportScopeSlug(scope) {
  return normalizeReportScopeId(scope);
}

/**
 * @param {string} filename
 * @param {string} [scope]
 * @returns {string | null | undefined} run_id suffix, undefined if no match
 */
export function parseReportRunIdFromFilename(filename, scope = 'national') {
  const parsed = parseReportFilename(filename);
  if (!parsed) return undefined;
  if (reportScopeSlug(parsed.scopeId) !== reportScopeSlug(scope)) return undefined;
  if (reportScopeSlug(scope) === 'national' && parsed.scopeId !== 'national') return undefined;
  return parsed.runId;
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
  return listReportJsonFilenamesForDate(reportsDir, date, opts.scope ?? 'national')
    .map((f) => join(reportsDir, f));
}

function resolveReportsDir(opts = {}) {
  if (opts.reportsDir) return opts.reportsDir;
  return resilienceReportsDir(ROOT);
}

function deriveReportMeta(parsed) {
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
}

function readReportMeta(jsonPath) {
  try {
    return getReportMetaCached(jsonPath, deriveReportMeta);
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
 * Prefer compact `{scope}-{days}-{DDMMYY}-{HHmm}.json`; legacy `resilience-report-*-data-*-run-*` still resolves.
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
  const reportsDir = resolveReportsDir(opts);

  const runId = opts.runId;
  if (typeof runId === 'string' && runId.length > 0) {
    return resolveSpecificReportJsonPath(reportsDir, date, opts.scope ?? 'national', runId);
  }

  const candidates = listReportJsonFilenamesForDate(reportsDir, date, opts.scope ?? 'national');
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
 * Resolve a markdown report path for date/scope/run (excludes `-brief.md`).
 * @param {string} date YYYY-MM-DD
 * @param {{ reportsDir?: string, scope?: string, runId?: string | null }} [opts]
 * @returns {string | null}
 */
export function resolveReportMdPathForDate(date, opts = {}) {
  const reportsDir = resolveReportsDir(opts);
  const scope = opts.scope ?? 'national';
  const runId = opts.runId;
  if (typeof runId === 'string' && runId.length > 0) {
    return resolveSpecificReportMdPath(reportsDir, date, scope, runId);
  }

  const candidates = listReportMdFilenamesForDate(reportsDir, date, scope);
  if (candidates.length === 0) return null;

  let bestPath = null;
  let bestMtime = -1;
  let bestRunId = '';
  for (const f of candidates) {
    const p = join(reportsDir, f);
    try {
      const m = statSync(p).mtimeMs;
      const parsed = parseReportFilename(f);
      const rid = parsed?.runId ?? '';
      if (m > bestMtime || (m === bestMtime && rid > bestRunId)) {
        bestMtime = m;
        bestRunId = rid;
        bestPath = p;
      }
    } catch {
      /* skip */
    }
  }
  return bestPath;
}

/**
 * Compact run ids are UTC HHmm from reportWriter basenames.
 * @param {string} date YYYY-MM-DD
 * @param {string | null | undefined} runId
 * @returns {string | null}
 */
function synthesizeGeneratedAtFromRunId(date, runId) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (typeof runId !== 'string' || !/^\d{4}$/.test(runId) || runId === '0000') return null;
  return `${date}T${runId.slice(0, 2)}:${runId.slice(2, 4)}:00.000Z`;
}

/**
 * Build a loadable payload from a markdown-only report (no sibling JSON).
 * @param {string} mdPath
 * @param {string} date
 * @param {string} scope
 * @param {string | null | undefined} runId
 */
function loadMarkdownOnlyReport(mdPath, date, scope, runId) {
  let markdown;
  try {
    markdown = readFileSync(mdPath, 'utf8');
  } catch {
    return null;
  }
  if (!String(markdown).trim()) return null;

  const articlesMatch = markdown.match(/\|\s*\*\*Articles analyzed\*\*\s*\|\s*(\d+)\s*\|/i);
  const articles = articlesMatch ? Number.parseInt(articlesMatch[1], 10) : 0;
  const generatedAt = synthesizeGeneratedAtFromRunId(date, runId);

  return {
    generated_at: generatedAt,
    assessment: {
      date,
      total_articles_analyzed: Number.isFinite(articles) ? articles : 0,
      components: [],
      report_scope: { id: normalizeReportScopeId(scope) },
      markdown_only: true,
    },
    markdown,
    reportDate: date,
  };
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
 * **Filesystem first:** the best `resilience-report-{date}-*.json` under resilience data/reports (highest
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
 * Parse a single reports-dir filename into a candidate edition record, or null if it
 * should be skipped (brief artifact, wrong extension, unparsable, wrong scope, unreadable).
 * @param {string} f
 * @param {{ nameSet: Set<string>, scope: string, dir: string }} ctx
 */
function reportEditionCandidateFromFilename(f, { nameSet, scope, dir }) {
  if (f.endsWith('-brief.md') || f.endsWith('-brief.json')) return null;
  if (!f.endsWith('.json') && !f.endsWith('.md')) return null;
  if (f.endsWith('.md') && nameSet.has(f.replace(/\.md$/i, '.json'))) return null;
  const parsed = parseReportFilename(f);
  if (!parsed) return null;
  if (reportScopeSlug(parsed.scopeId) !== scope) return null;
  if (scope === 'national' && parsed.scopeId !== 'national') return null;

  const jsonPath = join(dir, f);
  let mtime;
  try {
    mtime = statSync(jsonPath).mtimeMs;
  } catch {
    return null;
  }
  return {
    date: parsed.reportDate,
    run_id: parsed.runId,
    jsonPath,
    meta: readReportMeta(jsonPath),
    mtime,
  };
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

  const names = getDirNamesCached(dir);
  const nameSet = new Set(names);
  const candidates = names
    .map((f) => reportEditionCandidateFromFilename(f, { nameSet, scope, dir }))
    .filter(Boolean);

  candidates.sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    return compareReportCandidates(a.meta, a.mtime, b.meta, b.mtime);
  });

  return candidates.map(({ date, run_id, meta }) => {
    const windowFields = resolveEditionWindow(date, meta);
    const generatedAt = meta.generatedAt
      ?? synthesizeGeneratedAtFromRunId(date, run_id);
    return {
      date,
      run_id,
      generated_at: generatedAt,
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

/** Parse report JSON and attach markdown/cost sidecars. Returns null on parse failure. */
function _loadJsonReportPayload(jsonPath, date) {
  let parsed;
  try {
    // Shared cached object — the spread below gives callers a fresh top level;
    // nested objects are shared and must be treated as read-only.
    parsed = getParsedReportCached(jsonPath);
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

/** Markdown-only filesystem fallback when no sibling JSON exists. */
function _loadMarkdownReportPayload(date, { scope, reportsDir, runId }) {
  const mdPath = resolveReportMdPathForDate(date, { scope, reportsDir, runId });
  if (!(mdPath && existsSync(mdPath))) return null;
  const parsedRunId = runId
    || parseReportFilename(basename(mdPath))?.runId
    || null;
  return loadMarkdownOnlyReport(mdPath, date, scope, parsedRunId);
}

/** National-only store fallback when filesystem report files are absent. */
function _loadStoreReportPayload(date, store, scope) {
  if (!(scope === 'national' && store)) return null;
  const run = store.getLatestRunForDate(date);
  if (!run) return null;
  const costBreakdown = readCostBreakdownForDate(date);
  return {
    assessment: run.reportJson,
    markdown: run.reportMd ?? null,
    ...(costBreakdown ? { costBreakdown } : {}),
  };
}

/** Load a report for a specific date from filesystem or store. Returns payload or null. */
function _loadReportForDate(date, store, { scope = 'national', reportsDir, runId } = {}) {
  const jsonPath = resolveReportJsonPathForDate(date, { scope, reportsDir, runId });
  if (jsonPath && existsSync(jsonPath)) {
    return _loadJsonReportPayload(jsonPath, date);
  }

  // Markdown-only fallback (national archives often lack sibling JSON).
  // JSON is always preferred above — north/full runs with JSON are unchanged.
  return _loadMarkdownReportPayload(date, { scope, reportsDir, runId })
    ?? _loadStoreReportPayload(date, store, scope);
}

/** Scan the reports directory for the most recent report before `today`. */
function _findLatestAvailableReport(today, store, { scope = 'national', reportsDir } = {}) {
  const dir = reportsDir ?? resolveReportsDir();
  if (!existsSync(dir)) return null;

  const names = getDirNamesCached(dir);

  const dates = [...new Set(
    names
      .map((f) => parseReportFilename(f))
      .filter((p) => p && reportScopeSlug(p.scopeId) === scope && (scope !== 'national' || p.scopeId === 'national'))
      .map((p) => p.reportDate)
      .filter((d) => d && d < today),
  )].sort((a, b) => a.localeCompare(b));

  for (let i = dates.length - 1; i >= 0; i--) {
    const date = dates[i];
    const result = _loadReportForDate(date, store, { scope, reportsDir: dir });
    if (result) return { ...result, reportDate: date };
  }

  return null;
}
