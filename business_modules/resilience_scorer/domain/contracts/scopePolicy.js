import { normalizeReportScopeId } from '../../../../cross-cut-modules/geo/reportScopeIds.js';

/** @param {string} scope */
export function normalizeReportScope(scope) {
  return normalizeReportScopeId(scope);
}
