import { readFileSync } from 'node:fs';

import {
  resolveReportJsonPathForDate as resolveReportFromResilience,
  resilienceReportsDir,
} from '../../../../business_modules/resilience_scorer/index.js';

function readJsonSafe(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {string} rootDir
 * @param {string} date YYYY-MM-DD
 * @param {string} scope
 * @returns {string | null} absolute path
 */
export function resolveReportJsonPathForDate(rootDir, date, scope) {
  return resolveReportFromResilience(date, {
    reportsDir: resilienceReportsDir(rootDir),
    scope,
  });
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
