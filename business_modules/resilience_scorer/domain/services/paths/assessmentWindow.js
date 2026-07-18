/**
 * Assessment-window math and signal-bundle filename parsing (pure).
 * Shared by app assessment/pipeline code and infrastructure bundle adapters —
 * lives in domain/services/paths (naming/window policy) so infrastructure
 * never has to import app helpers.
 */

import { normalizeVisitsSourceType } from '../signals/visitsSourceType.js';

export const MAX_ASSESSMENT_DAYS = 14;

/** Placeholder bundle dates that must not enter the assessment window. */
export const INVALID_SIGNAL_BUNDLE_DATES = new Set(['1970-01-01']);

const PBO_BUNDLE_FILENAME_PATTERN =
  /^signals-pbo-(?:(north|south|jerusalem|haifa|dan)-)?(\d{4}-\d{2}-\d{2})\.json$/;
const STANDARD_BUNDLE_FILENAME_PATTERN = /^signals-(\w+)-(\d{4}-\d{2}-\d{2})\.json$/;

/**
 * @param {string} filename
 * @returns {{ sourceType: string, fileDate: string, districtId: string | null } | null}
 */
export function parseSignalBundleFilename(filename) {
  const base = String(filename ?? '').trim();
  const pbo = PBO_BUNDLE_FILENAME_PATTERN.exec(base);
  if (pbo) {
    return {
      sourceType: 'pbo',
      fileDate: pbo[2],
      districtId: pbo[1] ?? 'north',
    };
  }
  const std = STANDARD_BUNDLE_FILENAME_PATTERN.exec(base);
  if (!std) return null;
  const rawType = std[1];
  if (rawType === 'pbo') return null;
  const sourceType = normalizeVisitsSourceType(rawType);
  return {
    sourceType,
    fileDate: std[2],
    districtId: null,
  };
}

/** @param {number} dayOffset days before --date (0 = target day) */
export function temporalWeightForOffset(dayOffset) {
  if (dayOffset <= 0) return 1;
  if (dayOffset === 1) return 0.85;
  if (dayOffset === 2) return 0.7;
  const decay = 0.7 * Math.pow(0.7 / 0.85, dayOffset - 2);
  return Math.max(0.5, decay);
}

export function buildTargetDates(targetDate, days) {
  const targetDates = new Set();
  const base = new Date(targetDate);
  for (let i = 0; i < days; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    targetDates.add(d.toISOString().slice(0, 10));
  }
  return targetDates;
}

export function dateOffset(fileDate, targetDate) {
  const a = new Date(fileDate);
  const b = new Date(targetDate);
  return Math.round((b - a) / 86_400_000);
}

const SOURCE_FILE_DATE_RE = /(\d{4}-\d{2}-\d{2})/;

/**
 * Build persisted assessment_window metadata for report JSON.
 * @param {string} reportDate YYYY-MM-DD
 * @param {number} days
 * @param {{ pipelinePreset?: string | null }} [opts]
 */
export function buildAssessmentWindowMetadata(reportDate, days, { pipelinePreset = null } = {}) {
  const safeDays = Math.min(MAX_ASSESSMENT_DAYS, Math.max(1, Number(days) || 1));
  const windowDates = [...buildTargetDates(reportDate, safeDays)].sort((a, b) => b.localeCompare(a));
  const out = {
    days: safeDays,
    report_date: reportDate,
    window_dates: windowDates,
    window_start: windowDates[windowDates.length - 1],
    window_end: windowDates[0],
  };
  if (pipelinePreset) out.pipeline_preset = pipelinePreset;
  return out;
}

/**
 * Legacy fallback: infer a consecutive signal window ending at report_date.
 * Non-consecutive bundle dates in source_files (re-extract history) are ignored.
 * @param {string} reportDate YYYY-MM-DD
 * @param {string[]} sourceFiles
 * @returns {{ assessment_days: number, window_start: string, window_end: string } | null}
 */
export function inferAssessmentWindowFromSourceFiles(reportDate, sourceFiles) {
  if (!reportDate || !Array.isArray(sourceFiles) || sourceFiles.length === 0) return null;

  const bundleDates = [...new Set(
    sourceFiles
      .map((f) => SOURCE_FILE_DATE_RE.exec(String(f))?.[1])
      .filter((d) => d && d <= reportDate),
  )];
  if (!bundleDates.includes(reportDate)) return null;

  const dateSet = new Set(bundleDates);
  let count = 0;
  let windowStart = reportDate;
  let cursor = reportDate;
  while (count < MAX_ASSESSMENT_DAYS) {
    if (!dateSet.has(cursor)) break;
    windowStart = cursor;
    count += 1;
    const prev = new Date(cursor);
    prev.setDate(prev.getDate() - 1);
    cursor = prev.toISOString().slice(0, 10);
  }
  if (count === 0) return null;
  return {
    assessment_days: count,
    window_start: windowStart,
    window_end: reportDate,
  };
}

/**
 * basename-dated bundles only inside { targetDates } ∩ { ≤ targetDate }.
 * `retainLast` keeps up to N newest-by-filename-date within that set (deterministic replay).
 */
export function signalBundlesInAssessmentWindow(sortedFilenames, regex, targetDate, targetDates, retainLast) {
  const inWindow = [];
  for (const f of sortedFilenames) {
    const m = regex.exec(f);
    if (!m) continue;
    const fd = m[1];
    if (fd > targetDate || !targetDates.has(fd)) continue;
    inWindow.push(f);
  }
  const pick = retainLast == null ? inWindow : inWindow.slice(-retainLast);
  return new Set(pick);
}
