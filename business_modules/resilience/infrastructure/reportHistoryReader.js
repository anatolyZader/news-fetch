import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Walks `reports/resilience-report-{date}[-{HHMM}].json` (and the `-north-`
 * variant when scope='north'), picks the canonical file per date, and returns
 * a per-date summary suitable for the drift dashboard.
 *
 * Canonical pick rule per date: highest `assessment.total_articles_analyzed`,
 * tie-break on newest mtime (mirrors `api/analysisService.resolveReportJsonPathForDate`).
 *
 * Returned record shape per date:
 *   {
 *     date: 'YYYY-MM-DD',
 *     scope: 'national' | 'north',
 *     total_articles_analyzed: number,
 *     overall_score: number | null,
 *     components: [{ component_id, score, confidence, polarization, evidence_mass, signal_count }],
 *     signal_counts: { [signal_type]: count },         // from root signals[]
 *     source_type_mass: { [source_type]: count }      // proxy: count of signals per source_type
 *   }
 */

const PREFIXES = {
  national: 'resilience-report',
  north:    'resilience-report-north',
};

function prefixFor(scope) {
  return scope === 'north' ? PREFIXES.north : PREFIXES.national;
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
 * @param {'national'|'north'} [opts.scope='national']
 * @param {number} [opts.days=30]
 * @param {string} [opts.endDate] YYYY-MM-DD; defaults to today (UTC)
 * @returns {Array} chronologically-sorted history records (oldest first), one per date
 */
export function readResilienceHistory(opts = {}) {
  const reportsDir = opts.reportsDir ?? resolve(process.cwd(), 'reports');
  const scope = opts.scope === 'north' ? 'north' : 'national';
  const days = Number.isFinite(opts.days) && opts.days > 0 ? Math.floor(opts.days) : 30;
  const endDate = opts.endDate ?? new Date().toISOString().slice(0, 10);

  if (!existsSync(reportsDir)) return [];

  let names;
  try {
    names = readdirSync(reportsDir);
  } catch {
    return [];
  }

  const prefix = prefixFor(scope);
  // northern files start with `resilience-report-north-`. National files start with
  // `resilience-report-` AND must NOT match the north prefix to avoid double-counting.
  const escapedPrefix = prefix.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const datePattern = new RegExp(`^${escapedPrefix}-(\\d{4}-\\d{2}-\\d{2})(?:-(\\d{4}))?\\.json$`);
  const northRegex = new RegExp(`^${PREFIXES.north}-`);

  const startDate = daysAgoIsoFromAnchor(endDate, days - 1);

  const candidatesByDate = new Map();
  for (const f of names) {
    if (scope === 'national' && northRegex.test(f)) continue;
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

  const records = [];
  for (const [date, candidates] of candidatesByDate.entries()) {
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
    if (!best?.assessment) continue;
    records.push(summarizeReport(date, scope, best));
  }

  records.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
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

// Re-export for tests/internal use (not part of the public API)
export { daysAgoIso as _daysAgoIso };
