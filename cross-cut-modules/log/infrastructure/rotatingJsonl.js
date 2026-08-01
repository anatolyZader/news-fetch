/**
 * Daily-partitioned JSONL: `cost-log.jsonl` → `cost-log-2026-07-31.jsonl`.
 * Writers append to today's dated file; readers merge the requested dated
 * file(s) with the legacy un-dated file, which stays in place untouched
 * (fallback source for history written before rotation landed).
 *
 * LOG_ROTATION_ENABLED=false reverts writers to the legacy single file.
 */
import { existsSync } from 'node:fs';

import { appendJsonlRecord, readJsonlRecords } from './jsonlLog.js';

export function jsonlRotationEnabled() {
  return process.env.LOG_ROTATION_ENABLED !== 'false';
}

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * @param {string} basePath e.g. …/cost-log.jsonl
 * @param {string} dateUtc YYYY-MM-DD
 */
export function datedJsonlPath(basePath, dateUtc) {
  return basePath.replace(/\.jsonl$/i, `-${dateUtc}.jsonl`);
}

/**
 * Append to today's dated file (or the legacy file when rotation is off).
 * @param {string} basePath
 * @param {object} record
 */
export function appendRotatedJsonl(basePath, record) {
  const target = jsonlRotationEnabled() ? datedJsonlPath(basePath, utcToday()) : basePath;
  appendJsonlRecord(target, record);
}

/**
 * Records for one UTC date: dated file + legacy file. Callers still apply
 * their own date filter — the legacy file holds all history and today's
 * dated file may contain rows for other report dates (replays).
 * @param {string} basePath
 * @param {string} dateUtc YYYY-MM-DD
 * @returns {object[]}
 */
export function readRotatedJsonlForDate(basePath, dateUtc) {
  const dated = datedJsonlPath(basePath, dateUtc);
  return [
    ...readJsonlRecords(basePath),
    ...(dated === basePath ? [] : readJsonlRecords(dated)),
  ];
}

/**
 * Paths worth scanning for a lookback window: legacy + last `days` dated
 * files (only those that exist).
 * @param {string} basePath
 * @param {{ days?: number }} [opts]
 * @returns {string[]}
 */
export function listRotatedJsonlPaths(basePath, opts = {}) {
  const days = Number.isFinite(opts.days) && opts.days > 0 ? opts.days : 14;
  const paths = existsSync(basePath) ? [basePath] : [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
    const p = datedJsonlPath(basePath, date);
    if (p !== basePath && existsSync(p)) paths.push(p);
  }
  return paths;
}

/**
 * Merged records across the lookback window (legacy + dated files), in
 * file order. For CLI-style whole-log scans.
 * @param {string} basePath
 * @param {{ days?: number }} [opts]
 * @returns {object[]}
 */
export function readRotatedJsonlRecords(basePath, opts = {}) {
  return listRotatedJsonlPaths(basePath, opts).flatMap((p) => readJsonlRecords(p));
}
