/**
 * The only supported way to modify a report that has already been published.
 *
 * Pipeline position: not part of any run. Migration and repair tooling only.
 *
 * Owns: archive-before-rewrite ordering and atomic replacement of a persisted
 * report. Does NOT: decide what to change (callers supply the mutation), write
 * new reports (see `infrastructure/reportWriter.js`), or delete anything.
 *
 * Why this exists: `data/daily_reports/` is not tracked by git and has no
 * backup. On 2026-08-08 a vocabulary rename rewrote every historical report in
 * place, irreversibly — the pre-rename content of those records is gone. A
 * report is the record of what the system said on a date; if it must change,
 * the prior version has to survive.
 *
 * Prefer not to rewrite at all: `domain/contracts/reportKeyAliases.js` handles
 * renamed keys at read time, which leaves history untouched.
 *
 * Key collaborators: `cross-cut-modules/log/archiveArtifactBeforeWrite.js`
 * (same archive convention as signal bundles), `reportKeyAliases.js`.
 */

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { archiveArtifactBeforeWrite } from '../../../../cross-cut-modules/log/index.js';

/**
 * Archive a published report, then replace it with the mutation's result.
 *
 * The archive copy is written and verified before the canonical file is
 * touched, so a failure part-way through leaves either the original or the
 * original plus an archive copy — never a rewritten report with no history.
 *
 * @param {string} reportPath absolute path to the report JSON
 * @param {(report: object) => object} mutate returns the new report; must not
 *   mutate its argument
 * @param {{ dryRun?: boolean }} [opts]
 * @returns {{ changed: boolean, archivedPath: string|null, reason?: string }}
 */
export function rewritePersistedReport(reportPath, mutate, { dryRun = false } = {}) {
  if (!existsSync(reportPath)) {
    return { changed: false, archivedPath: null, reason: 'missing' };
  }

  const before = readFileSync(reportPath, 'utf8');
  const next = mutate(JSON.parse(before));
  const after = `${JSON.stringify(next, null, 2)}\n`;

  if (after === before) return { changed: false, archivedPath: null, reason: 'identical' };
  if (dryRun) return { changed: true, archivedPath: null, reason: 'dry_run' };

  const archivedPath = archiveArtifactBeforeWrite(reportPath);
  if (!archivedPath || !existsSync(archivedPath)) {
    throw new Error(`Refusing to rewrite ${reportPath}: archive copy was not created`);
  }
  if (readFileSync(archivedPath, 'utf8') !== before) {
    throw new Error(`Refusing to rewrite ${reportPath}: archive copy does not match the original`);
  }

  // Temp + rename, matching reportWriter.js: a reader never sees a partial file.
  const tempPath = `${reportPath}.tmp`;
  writeFileSync(tempPath, after);
  renameSync(tempPath, reportPath);

  return { changed: true, archivedPath };
}
