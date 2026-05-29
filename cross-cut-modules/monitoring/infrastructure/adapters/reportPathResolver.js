import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { normalizeReportScopeId, reportFilePrefix } from '../../../geo/reportScopeIds.js';

function readJsonSafe(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readAssessmentTotalArticles(jsonPath) {
  const data = readJsonSafe(jsonPath);
  const n = data?.assessment?.total_articles_analyzed;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/**
 * @param {string} rootDir
 * @param {string} date YYYY-MM-DD
 * @param {string} scope
 * @returns {string | null} absolute path
 */
export function resolveReportJsonPathForDate(rootDir, date, scope) {
  const reportsDir = join(rootDir, 'reports');
  if (!existsSync(reportsDir)) return null;

  const prefixBase = reportFilePrefix(normalizeReportScopeId(scope));
  const exact = join(reportsDir, `${prefixBase}-${date}.json`);
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
      if (articles > bestArticles || (articles === bestArticles && m > bestMtime)) {
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
 * @param {string} jsonPath
 */
export function readReportMeta(jsonPath) {
  const data = readJsonSafe(jsonPath);
  if (!data) return null;
  return {
    generated_at: data.generated_at ?? data.assessment?.date ?? null,
    total_articles_analyzed: data.assessment?.total_articles_analyzed ?? null,
    total_signals: Array.isArray(data.signals) ? data.signals.length : null,
  };
}
