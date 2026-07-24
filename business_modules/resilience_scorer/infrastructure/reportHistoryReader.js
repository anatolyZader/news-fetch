import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  normalizeReportScopeId,
  isRegionalReportScope,
} from '../../../cross-cut-modules/geo/reportScopeIds.js';
import { parseReportFilename, reportScopeSlug, reportFilenameMatchesDate, listReportJsonFilenamesForDate } from '../domain/services/paths/reportNames.js';
import { resilienceReportsDir } from '../domain/services/paths/outputDirs.js';

/**
 * Walks resilience data/reports (compact `{scope}-{days}-{DDMMYY}-{HHmm}` or legacy run-scoped names).
 */

function readReportFileNames(reportsDir) {
  try {
    return readdirSync(reportsDir);
  } catch {
    return [];
  }
}

/**
 * @param {string[]} names
 * @param {object} ctx
 */
function indexReportCandidatesByDate(names, ctx) {
  const { reportsDir, scope, startDate, endDate } = ctx;
  const scopeId = normalizeReportScopeId(scope);
  const candidatesByDate = new Map();
  for (const f of names) {
    if (!f.endsWith('.json')) continue;
    const parsed = parseReportFilename(f);
    if (!parsed) continue;
    if (reportScopeSlug(parsed.scopeId) !== reportScopeSlug(scopeId)) continue;
    if (scopeId === 'national' && isRegionalReportScope(parsed.scopeId)) continue;
    const date = parsed.reportDate;
    if (date < startDate || date > endDate) continue;
    const fullPath = join(reportsDir, f);
    let mtime = 0;
    try { mtime = statSync(fullPath).mtimeMs; } catch { /* ignore */ }
    const arr = candidatesByDate.get(date) ?? [];
    arr.push({ path: fullPath, mtime });
    candidatesByDate.set(date, arr);
  }
  return candidatesByDate;
}

/**
 * Trend-history heuristic: most complete record per date (articles → mtime).
 * Intentionally different from reportCacheService.isBetterReportCandidate, which
 * also weighs the critical flag and generatedAt when picking the report to serve.
 * (findLatestReportFile below is a third heuristic: lexical filename sort = latest run.)
 * @param {Array<{ path: string, mtime: number }>} candidates
 */
function pickBestReportRecord(candidates) {
  let best = null;
  let bestArticles = -Infinity;
  let bestMtime = -1;
  for (const cand of candidates) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(cand.path, 'utf8'));
    } catch {
      continue;
    }
    const articles = parsed?.assessment?.total_articles_analyzed ?? 0;
    if (articles > bestArticles || (articles === bestArticles && cand.mtime > bestMtime)) {
      best = parsed;
      bestArticles = articles;
      bestMtime = cand.mtime;
    }
  }
  return best;
}

function daysAgoIso(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Read the canonical report files for a window of dates.
 *
 * @param {object} opts
 * @param {string} [opts.reportsDir] absolute path; defaults to resilience data/reports
 * @param {string} [opts.scope='national']
 * @param {number} [opts.days=30]
 * @param {string} [opts.endDate] YYYY-MM-DD; defaults to today (UTC)
 * @returns {Array} chronologically-sorted history records (oldest first), one per date
 */
/**
 * Load the prior n days' assessment objects (newest last) for trajectory
 * comparison. National-scope only (v1 limitation) — regional callers should
 * pass an empty prior list. Injectable reportsDir keeps tests hermetic.
 *
 * @param {string} targetDate YYYY-MM-DD report date
 * @param {number} [n=2] how many days back to look
 * @param {string} [reportsDir] absolute reports dir
 * @returns {Array<object>} prior report `assessment` objects, oldest first
 */
export function loadPriorReports(targetDate, n = 2, reportsDir = resilienceReportsDir()) {
  if (!existsSync(reportsDir)) return [];
  const prior = [];
  const d = new Date(targetDate);
  for (let i = 1; i <= n; i++) {
    const p = new Date(d);
    p.setDate(d.getDate() - i);
    const pd = p.toISOString().slice(0, 10);
    const matches = listReportJsonFilenamesForDate(reportsDir, pd, 'national');
    const match = [...matches].sort((a, b) => a.localeCompare(b)).at(-1);
    if (match) {
      try {
        const json = JSON.parse(readFileSync(resolve(reportsDir, match), 'utf8'));
        prior.unshift(json.assessment);
      } catch { /* ignore */ }
    }
  }
  return prior;
}

export function readResilienceHistory(opts = {}) {
  const reportsDir = opts.reportsDir ?? resilienceReportsDir();
  const scope = normalizeReportScopeId(opts.scope);
  const days = Number.isFinite(opts.days) && opts.days > 0 ? Math.floor(opts.days) : 30;
  const endDate = opts.endDate ?? new Date().toISOString().slice(0, 10);

  if (!existsSync(reportsDir)) return [];

  const names = readReportFileNames(reportsDir);
  const startDate = daysAgoIsoFromAnchor(endDate, days - 1);
  const candidatesByDate = indexReportCandidatesByDate(names, {
    reportsDir,
    scope,
    startDate,
    endDate,
  });

  const records = [];
  for (const [date, candidates] of candidatesByDate.entries()) {
    const best = pickBestReportRecord(candidates);
    if (!best?.assessment) continue;
    records.push(summarizeReport(date, scope, best));
  }

  records.sort((a, b) => a.date.localeCompare(b.date));
  return records;
}

function daysAgoIsoFromAnchor(anchorIso, days) {
  const [y, m, d] = anchorIso.split('-').map((s) => Number.parseInt(s, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

/** Numeric certainty for drift aggregation: prefer JSON float; else bucket proxy. */
export function certaintyNumericFromComponent(c) {
  if (c == null) return null;
  if (typeof c.certainty === 'number' && !Number.isNaN(c.certainty)) {
    return Math.min(1, Math.max(0, c.certainty));
  }
  const bucket = c.confidence;
  if (bucket === 'high') return 0.85;
  if (bucket === 'medium') return 0.55;
  if (bucket === 'low') return 0.35;
  if (bucket === 'insufficient_data') return null;
  return null;
}

function summarizeReport(date, scope, parsed) {
  const a = parsed.assessment;
  const components = Array.isArray(a.components)
    ? a.components.map((c) => ({
        component_id:  c.component_id,
        score:         c.score ?? null,
        confidence:    c.confidence ?? null,
        certainty:     certaintyNumericFromComponent(c),
        polarization:  c.polarization ?? null,
        evidence_mass: c.evidence_mass ?? null,
        signal_count:  c.signal_count ?? null,
        erosion_index: c.erosion_index ?? null,
        z_score_chronic: c.z_score_chronic ?? null,
        delta_chronic: c.delta_chronic ?? null,
      }))
    : [];

  const signalCounts = {};
  const sourceMass = {};
  if (Array.isArray(parsed.signals)) {
    for (const s of parsed.signals) {
      const t = s?.signal_type ?? s?.type;
      if (t) signalCounts[t] = (signalCounts[t] || 0) + 1;
      const st = s?.source_type;
      if (st) sourceMass[st] = (sourceMass[st] || 0) + 1;
    }
  }

  return {
    date,
    scope,
    total_articles_analyzed: a.total_articles_analyzed ?? 0,
    overall_score: a.overall_resilience_score ?? null,
    components,
    signal_counts: signalCounts,
    source_type_mass: sourceMass,
  };
}

export { daysAgoIso as _daysAgoIso };

// ---------------------------------------------------------------------------
// Historical score and signal loaders (moved from app/assessSignalsHelpers.js)
// ---------------------------------------------------------------------------

function matchesReportScope(f, dStr, scope) {
  return f.endsWith('.json') && reportFilenameMatchesDate(f, dStr, scope);
}

function findLatestReportFile(allFiles, dStr, scope) {
  return allFiles
    .filter((f) => matchesReportScope(f, dStr, scope))
    .sort((a, b) => a.localeCompare(b))
    .at(-1);
}

function loadDailyScorePayload(dir, allFiles, targetTime, dayOffset, scope, knownComponents) {
  const d = new Date(targetTime);
  d.setUTCDate(d.getUTCDate() - dayOffset);
  const dStr = d.toISOString().slice(0, 10);
  const match = findLatestReportFile(allFiles, dStr, scope);
  if (!match) return null;
  try {
    const json = JSON.parse(readFileSync(join(dir, match), 'utf8'));
    // Non-normal days (field_anchor_only, abstained) publish partial or frozen
    // scores — they must not seed the smoothing/delta baseline.
    const mode = json.assessment?.assessment_mode;
    if (mode != null && mode !== 'normal') return null;
    const components = json.assessment?.components ?? [];
    const byId = {};
    for (const c of components) {
      knownComponents.add(c.component_id);
      byId[c.component_id] = c.score ?? null;
    }
    return byId;
  } catch {
    return null;
  }
}

function seriesFromDailyPayload(dailyPayload, knownComponents, days) {
  const seriesByComponent = {};
  for (const id of knownComponents) seriesByComponent[id] = [];
  for (let i = 0; i < days; i++) {
    const payload = dailyPayload[i];
    for (const id of knownComponents) {
      const v = payload == null || !(id in payload) ? null : payload[id];
      seriesByComponent[id].push(v);
    }
  }
  return seriesByComponent;
}

/**
 * Walk reports dir and return per-component score history for the trailing
 * `days` days BEFORE `targetDate` (i.e. excluding `targetDate` itself).
 *
 * @param {string} targetDate YYYY-MM-DD
 * @param {string} [reportsDir]
 * @param {number} [days]
 * @param {string} [scope]  'national' | 'north' — selects report file prefix
 * @returns {Record<string, Array<number|null>>}
 */
export function loadHistoricalScores(targetDate, reportsDir = resilienceReportsDir(), days = 14, scope = 'national') {
  const dir = resolve(reportsDir);
  if (!existsSync(dir)) return {};
  const allFiles = readdirSync(dir);
  const targetTime = new Date(targetDate).getTime();
  if (Number.isNaN(targetTime)) return {};

  const knownComponents = new Set();
  const dailyPayload = new Array(days).fill(null);
  for (let i = 1; i <= days; i++) {
    dailyPayload[i - 1] = loadDailyScorePayload(dir, allFiles, targetTime, i, scope, knownComponents);
  }
  return seriesFromDailyPayload(dailyPayload, knownComponents, days);
}

/**
 * Load signal arrays from prior report JSON files (for data-void baseline volume).
 * Returns one array per day that had a report, oldest first.
 *
 * @param {string} targetDate YYYY-MM-DD
 * @param {string} [reportsDir]
 * @param {number} [days]
 * @param {'national'|'north'} [scope]
 * @returns {Array<Array<object>>}
 */
export function loadHistoricalSignalDays(targetDate, reportsDir = resilienceReportsDir(), days = 7, scope = 'national') {
  const dir = resolve(reportsDir);
  if (!existsSync(dir)) return [];
  const allFiles = readdirSync(dir);
  const targetTime = new Date(targetDate).getTime();
  if (Number.isNaN(targetTime)) return [];

  const out = [];
  for (let i = days; i >= 1; i--) {
    const d = new Date(targetTime);
    d.setUTCDate(d.getUTCDate() - i);
    const dStr = d.toISOString().slice(0, 10);
    const match = findLatestReportFile(allFiles, dStr, scope);
    if (!match) continue;
    try {
      const json = JSON.parse(readFileSync(join(dir, match), 'utf8'));
      const signals = json.signals ?? [];
      if (Array.isArray(signals) && signals.length > 0) out.push(signals);
    } catch {
      // skip unreadable report
    }
  }
  return out;
}
