import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  isRegionalReportFilename,
  normalizeReportScopeId,
  reportFilePrefix,
} from '../../../cross-cut-modules/geo/reportScopeIds.js';

/**
 * Walks `reports/resilience-report-{scope}-{date}[-{HHMM}].json`, picks the canonical file per date.
 */

function prefixFor(scope) {
  return reportFilePrefix(normalizeReportScopeId(scope));
}

function escapeRegExpPrefix(prefix) {
  return prefix.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

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
  const { reportsDir, scope, startDate, endDate, datePattern } = ctx;
  const candidatesByDate = new Map();
  for (const f of names) {
    if (scope === 'national' && isRegionalReportFilename(f)) continue;
    const m = datePattern.exec(f);
    if (!m) continue;
    const date = m[1];
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
 * @param {string} [opts.reportsDir] absolute path; defaults to `<cwd>/reports`
 * @param {string} [opts.scope='national']
 * @param {number} [opts.days=30]
 * @param {string} [opts.endDate] YYYY-MM-DD; defaults to today (UTC)
 * @returns {Array} chronologically-sorted history records (oldest first), one per date
 */
export function readResilienceHistory(opts = {}) {
  const reportsDir = opts.reportsDir ?? resolve(process.cwd(), 'reports');
  const scope = normalizeReportScopeId(opts.scope);
  const days = Number.isFinite(opts.days) && opts.days > 0 ? Math.floor(opts.days) : 30;
  const endDate = opts.endDate ?? new Date().toISOString().slice(0, 10);

  if (!existsSync(reportsDir)) return [];

  const names = readReportFileNames(reportsDir);
  const prefix = prefixFor(scope);
  const datePattern = new RegExp(
    String.raw`^${escapeRegExpPrefix(prefix)}-(\d{4}-\d{2}-\d{2})(?:-(\d{4}))?\.json$`,
  );
  const startDate = daysAgoIsoFromAnchor(endDate, days - 1);
  const candidatesByDate = indexReportCandidatesByDate(names, {
    reportsDir,
    prefix,
    scope,
    startDate,
    endDate,
    datePattern,
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
