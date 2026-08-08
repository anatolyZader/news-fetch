/**
 * Digest report-selection knobs.
 *
 * The defaults below are TEMPORARY user preferences (set 2026-08-08): the
 * digest reads the north scope and shows whichever report was generated most
 * recently, whatever period it covers. Reverting is a config change, not a code
 * change — set MAIL_DIGEST_REPORT_SCOPE=national and
 * MAIL_DIGEST_REPORT_SELECTION=latest_date.
 */
import { normalizeReportScopeId } from '../../../cross-cut-modules/geo/reportScopeIds.js';

export const DEFAULT_DIGEST_REPORT_SCOPE = 'north';
export const DEFAULT_DIGEST_REPORT_SELECTION = 'latest_generated';

const SELECTIONS = ['latest_generated', 'latest_date'];

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   scope: string, scopeRaw: string, scopeCoerced: boolean,
 *   selection: 'latest_generated'|'latest_date', selectionRaw: string, selectionCoerced: boolean,
 * }}
 */
export function resolveDigestReportConfig(env = process.env) {
  const scopeRaw = env.MAIL_DIGEST_REPORT_SCOPE?.trim() || DEFAULT_DIGEST_REPORT_SCOPE;
  const scope = normalizeReportScopeId(scopeRaw);

  const selectionRaw = env.MAIL_DIGEST_REPORT_SELECTION?.trim() || DEFAULT_DIGEST_REPORT_SELECTION;
  const normalizedSelection = selectionRaw.toLowerCase();
  const selection = SELECTIONS.includes(normalizedSelection)
    ? normalizedSelection
    : DEFAULT_DIGEST_REPORT_SELECTION;

  return {
    scope,
    scopeRaw,
    // normalizeReportScopeId silently degrades anything unknown to 'national',
    // so a typo would revert the whole preference invisibly. Surface it.
    scopeCoerced: scope !== scopeRaw.trim().toLowerCase(),
    selection,
    selectionRaw,
    selectionCoerced: selection !== normalizedSelection,
  };
}
