/**
 * Compact resilience report basenames: `{scope}-{days}-{DDMMYY}-{HHmm}`.
 *
 * Pipeline position: STAGE-2 assess finalize and report HTTP API — filename format
 * and parsing only (callers pass an already-resolved `reportsDir`).
 *
 * Owns: compact + legacy basename regexes, build/parse helpers, report path lookup.
 * Does NOT: resolve absolute report directories (see `outputDirs.js`) or write JSON.
 *
 * Key collaborators: `paths/outputDirs.js`, `input/reportRoutes.js`,
 * `cross-cut-modules/geo/reportScopeIds.js`.
 */

import { join } from 'node:path';
import { resolveStateStore } from '../../../../../cross-cut-modules/persistence/domain/resolveStateStore.js';
import {
  normalizeReportScopeId,
  isRegionalReportScope,
  reportFilePrefix,
} from '../../../../../cross-cut-modules/geo/reportScopeIds.js';

function getStore(deps = {}) {
  return resolveStateStore(deps);
}

// ---------------------------------------------------------------------------
// Basename regexes
// ---------------------------------------------------------------------------

/** Compact report basename: `{scope}-{days}-{DDMMYY}-{HHmm}`. */
export const COMPACT_REPORT_BASENAME_RE = /^([a-z]+)-(\d{1,2})-(\d{6})-(\d{4})$/;

/** Legacy report basename with optional regional scope and run id. */
export const LEGACY_REPORT_BASENAME_RE =
  /^resilience-report(?:-(north|south|jerusalem|dan|haifa))?-data-(\d{4}-\d{2}-\d{2})-run-([^.]+)$/;

/** Legacy national report basename (date only). */
export const LEGACY_SIMPLE_DATE_RE = /^resilience-report-(\d{4}-\d{2}-\d{2})$/;

/** Legacy national report basename with run id. */
export const LEGACY_SIMPLE_RUN_RE = /^resilience-report-(\d{4}-\d{2}-\d{2})-(\d{4})$/;

/** Legacy regional report basename with run id. */
export const LEGACY_REGIONAL_SIMPLE_RUN_RE =
  /^resilience-report-(north|south|jerusalem|dan|haifa)-(\d{4}-\d{2}-\d{2})-(\d{4})$/;

// ---------------------------------------------------------------------------
// Date token conversion
// ---------------------------------------------------------------------------

/**
 * Convert ISO date to compact DDMMYY token for basenames.
 * @param {string} isoDate YYYY-MM-DD
 * @returns {string} DDMMYY
 */
export function ddMmYyFromIsoDate(isoDate) {
  const [y, m, d] = String(isoDate).split('-');
  return `${d}${m}${y.slice(-2)}`;
}

/**
 * Convert DDMMYY token back to ISO date.
 * @param {string} ddmmyy
 * @returns {string} YYYY-MM-DD
 */
export function isoDateFromDdMmYy(ddmmyy) {
  return `20${ddmmyy.slice(4, 6)}-${ddmmyy.slice(2, 4)}-${ddmmyy.slice(0, 2)}`;
}

/**
 * @deprecated legacy compact token (YYMMDD); used only when re-reading old filenames
 * @param {string} isoDate YYYY-MM-DD
 * @returns {string}
 */
export function yyMmDdFromIsoDate(isoDate) {
  const [y, m, d] = String(isoDate).split('-');
  return `${y.slice(-2)}${m}${d}`;
}

/**
 * @deprecated legacy compact token (YYMMDD)
 * @param {string} yymmdd
 * @returns {string} YYYY-MM-DD
 */
export function isoDateFromYyMmDd(yymmdd) {
  return `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
}

/**
 * Parse compact 6-digit date token (DDMMYY).
 * @param {string} token
 * @returns {string} YYYY-MM-DD
 */
export function isoDateFromCompactToken(token) {
  return isoDateFromDdMmYy(token);
}

// ---------------------------------------------------------------------------
// Scope and basename builders
// ---------------------------------------------------------------------------

/**
 * Normalize scope id to report filename slug (e.g. `national`, `north`).
 * @param {string} scopeId
 * @returns {string}
 */
export function reportScopeSlug(scopeId) {
  return normalizeReportScopeId(scopeId);
}

/**
 * Build compact report basename without extension.
 * @param {object} params
 * @param {string} params.scopeId
 * @param {number} params.days assessment window length (counts back from reportDate)
 * @param {string} params.reportDate YYYY-MM-DD window end
 * @param {Date} [params.runAt] defaults to now (UTC HHmm in basename)
 * @returns {string} basename without extension
 */
export function buildReportBasename({ scopeId, days, reportDate, runAt = new Date() }) {
  const scope = reportScopeSlug(scopeId);
  const safeDays = Math.min(14, Math.max(1, Number(days) || 1));
  const ddmmyy = ddMmYyFromIsoDate(reportDate);
  const hhmm = runAt.toISOString().slice(11, 16).replace(':', '');
  return `${scope}-${safeDays}-${ddmmyy}-${hhmm}`;
}

// ---------------------------------------------------------------------------
// Parse and classify filenames
// ---------------------------------------------------------------------------

/**
 * Parse compact or legacy report filename into structured fields.
 * @param {string} filename or basename
 * @returns {{
 *   format: 'compact' | 'legacy',
 *   scopeId: string,
 *   days: number,
 *   reportDate: string,
 *   runId: string,
 * } | null}
 */
export function parseReportFilename(filename) {
  const base = String(filename ?? '')
    .replace(/\.json$/i, '')
    .replace(/\.md$/i, '')
    .replace(/-brief$/i, '');

  const compact = COMPACT_REPORT_BASENAME_RE.exec(base);
  if (compact) {
    return {
      format: 'compact',
      scopeId: compact[1],
      days: Number.parseInt(compact[2], 10),
      reportDate: isoDateFromCompactToken(compact[3]),
      runId: compact[4],
    };
  }

  const legacy = LEGACY_REPORT_BASENAME_RE.exec(base);
  if (legacy) {
    const regional = legacy[1];
    const scopeId = regional ?? 'national';
    return {
      format: 'legacy',
      scopeId,
      days: 1,
      reportDate: legacy[2],
      runId: legacy[3],
    };
  }

  const regionalSimple = LEGACY_REGIONAL_SIMPLE_RUN_RE.exec(base);
  if (regionalSimple) {
    return {
      format: 'legacy',
      scopeId: regionalSimple[1],
      days: 1,
      reportDate: regionalSimple[2],
      runId: regionalSimple[3],
    };
  }

  const simpleRun = LEGACY_SIMPLE_RUN_RE.exec(base);
  if (simpleRun) {
    return {
      format: 'legacy',
      scopeId: 'national',
      days: 1,
      reportDate: simpleRun[1],
      runId: simpleRun[2],
    };
  }

  const simpleDate = LEGACY_SIMPLE_DATE_RE.exec(base);
  if (simpleDate) {
    return {
      format: 'legacy',
      scopeId: 'national',
      days: 1,
      reportDate: simpleDate[1],
      runId: '0000',
    };
  }

  return null;
}

/**
 * Whether a filename matches any known resilience report basename format.
 * @param {string} filename
 * @returns {boolean}
 */
export function isResilienceReportFilename(filename) {
  return parseReportFilename(filename) != null;
}

/**
 * Whether a filename is a regional-scope compact/legacy report.
 * @param {string} filename
 * @returns {boolean}
 */
export function isRegionalReportFilenameCompact(filename) {
  const parsed = parseReportFilename(filename);
  if (!parsed) return false;
  return isRegionalReportScope(parsed.scopeId);
}

/**
 * Whether a filename is a national-scope report.
 * @param {string} filename
 * @returns {boolean}
 */
export function isNationalReportFilename(filename) {
  const parsed = parseReportFilename(filename);
  if (!parsed) return false;
  return !isRegionalReportScope(parsed.scopeId);
}

/**
 * Whether a report filename matches a given date and scope.
 * @param {string} filename
 * @param {string} date YYYY-MM-DD
 * @param {string} scopeId
 * @returns {boolean}
 */
export function reportFilenameMatchesDate(filename, date, scopeId) {
  const parsed = parseReportFilename(filename);
  if (!parsed) return false;
  if (reportScopeSlug(parsed.scopeId) !== reportScopeSlug(scopeId)) return false;
  if (reportScopeSlug(scopeId) === 'national' && isRegionalReportScope(parsed.scopeId)) return false;
  return parsed.reportDate === date;
}

// ---------------------------------------------------------------------------
// Filesystem lookup
// ---------------------------------------------------------------------------

/**
 * Resolve absolute path to a specific report JSON by date, scope, and run id.
 * @param {string} reportsDir
 * @param {string} date YYYY-MM-DD
 * @param {string} scopeId
 * @param {string} runId
 * @returns {string | null} absolute path
 */
export function resolveSpecificReportJsonPath(reportsDir, date, scopeId, runId) {
  const ddmmyy = ddMmYyFromIsoDate(date);
  const scope = reportScopeSlug(scopeId);

  const store = getStore();
  const compactExact = join(reportsDir, `${scope}-1-${ddmmyy}-${runId}.json`);
  if (store.existsSync(compactExact)) return compactExact;

  let names;
  try {
    names = store.readdirSync(reportsDir);
  } catch {
    names = [];
  }

  const escapedRunId = runId.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const compactRe = new RegExp(
    String.raw`^${scope}-\d{1,2}-${ddmmyy}-${escapedRunId}\.json$`,
  );
  const compactHit = names.find((f) => compactRe.test(f));
  if (compactHit) return join(reportsDir, compactHit);

  const legacyPrefix = reportFilePrefix(scope);
  const legacy = join(reportsDir, `${legacyPrefix}-data-${date}-run-${runId}.json`);
  if (store.existsSync(legacy)) return legacy;

  const legacySimple = join(reportsDir, `${legacyPrefix}-${date}-${runId}.json`);
  if (store.existsSync(legacySimple)) return legacySimple;

  if (scope === 'national') {
    const nationalExact = join(reportsDir, `resilience-report-${date}.json`);
    if (store.existsSync(nationalExact)) return nationalExact;
  }

  return null;
}

/**
 * List report JSON filenames for a given date and scope.
 * @param {string} reportsDir
 * @param {string} date YYYY-MM-DD
 * @param {string} scopeId
 * @returns {string[]}
 */
export function listReportJsonFilenamesForDate(reportsDir, date, scopeId) {
  let names;
  try {
    names = getStore().readdirSync(reportsDir);
  } catch {
    return [];
  }
  return names.filter(
    (f) => f.endsWith('.json') && reportFilenameMatchesDate(f, date, scopeId),
  );
}
