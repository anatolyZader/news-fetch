/**
 * Build the cross-report critique artifact: load the last N report JSONs,
 * critique their narrative claims, and fold the result into recurring findings.
 *
 * Pipeline position: post-hoc user QA only. Never called from assess; reads
 * finished reports and writes one artifact under `data/critiques/`.
 *
 * Owns: report selection (scope filter, latest-run-per-date dedupe), file I/O,
 * artifact naming.
 * Does NOT: score claims (see `domain/services/critique/crossReportCritique.js`),
 * call LLMs, or mutate reports.
 *
 * Key collaborators: `domain/services/critique/crossReportCritique.js`,
 * `domain/services/paths/reportNames.js`, `domain/services/paths/outputDirs.js`,
 * `input/run-cross-report-critique.js`.
 */

import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { resilienceReportsDir, resilienceCritiquesDir } from '../../domain/services/paths/outputDirs.js';
import { parseReportFilename } from '../../domain/services/paths/reportNames.js';
import {
  critiqueReport,
  aggregateCritiques,
  CRITIQUE_DEFAULTS,
} from '../../domain/services/critique/crossReportCritique.js';

/** Re-exported so input-layer CLIs get thresholds without reaching into domain. */
export { CRITIQUE_DEFAULTS } from '../../domain/services/critique/crossReportCritique.js';

/**
 * Newest report JSON per (scope, report date), most recent data date first.
 * Omission audits and briefs share the reports dir; `parseReportFilename`
 * rejects them, which is what keeps them out.
 *
 * @param {object} [options]
 * @param {string} [options.reportsDir]
 * @param {string} [options.scope] restrict to one report scope id (e.g. 'north')
 * @param {number} [options.limit=8] how many reports to critique
 * @returns {Array<{ file: string, path: string, scopeId: string, reportDate: string, runId: string }>}
 */
export function selectReportFiles({ reportsDir = resilienceReportsDir(), scope, limit = 8 } = {}) {
  const parsed = readdirSync(reportsDir)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .map((file) => ({ file, meta: parseReportFilename(file) }))
    .filter((e) => e.meta != null)
    .filter((e) => !scope || e.meta.scopeId === scope)
    .map((e) => ({
      file: e.file,
      path: join(reportsDir, e.file),
      scopeId: e.meta.scopeId,
      reportDate: e.meta.reportDate,
      runId: e.meta.runId,
    }));

  // One report per (scope, data date): keep the newest run, so a re-run does not
  // count as a second occurrence of the same claim.
  /** @type {Map<string, object>} */
  const latest = new Map();
  for (const entry of parsed) {
    const key = `${entry.scopeId}:${entry.reportDate}`;
    const held = latest.get(key);
    if (!held || String(entry.runId) > String(held.runId)) latest.set(key, entry);
  }

  return [...latest.values()]
    .sort((a, b) => b.reportDate.localeCompare(a.reportDate))
    .slice(0, Math.max(1, limit))
    // Chronological for deterministic clustering and readable output.
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate));
}

/**
 * Run the critique over selected reports without writing anything.
 *
 * @param {object} [options] see `selectReportFiles`, plus `thresholds`
 * @returns {object} artifact body
 */
export function buildCrossReportCritique(options = {}) {
  const { thresholds = CRITIQUE_DEFAULTS } = options;
  const files = selectReportFiles(options);
  if (files.length === 0) {
    throw new Error(`No report JSONs found in ${options.reportsDir ?? resilienceReportsDir()}`
      + (options.scope ? ` for scope '${options.scope}'` : ''));
  }

  const perReport = files.map((f) => {
    const report = JSON.parse(readFileSync(f.path, 'utf8'));
    return critiqueReport(report, { filename: f.file, thresholds });
  });

  const aggregate = aggregateCritiques(perReport, { thresholds });
  return {
    kind: 'cross_report_critique',
    version: 1,
    scope: options.scope ?? 'all',
    report_count: perReport.length,
    date_range: {
      from: perReport[0]?.report?.date ?? null,
      to: perReport.at(-1)?.report?.date ?? null,
    },
    ...aggregate,
    per_report: perReport.map((r) => ({
      report: r.report,
      component_summary: r.component_summary,
      claim_count: r.claims.length,
      weak_claim_count: r.claims.filter((c) => c.weakness_kinds.length > 0).length,
    })),
  };
}

/**
 * Build and persist the critique artifact.
 *
 * @param {object} [options] see `buildCrossReportCritique`, plus `critiquesDir`
 * @returns {{ artifactPath: string, payload: object }}
 */
export function buildAndWriteCrossReportCritique(options = {}) {
  const payload = buildCrossReportCritique(options);
  const critiquesDir = options.critiquesDir ?? resilienceCritiquesDir();
  mkdirSync(critiquesDir, { recursive: true });

  const scope = payload.scope;
  const { from, to } = payload.date_range;
  const artifactPath = join(critiquesDir, `critique-${scope}-${from}-to-${to}.json`);
  writeFileSync(artifactPath, `${JSON.stringify(payload, null, 2)}\n`);

  return { artifactPath, payload };
}
