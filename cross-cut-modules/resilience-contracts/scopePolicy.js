import { normalizeReportScopeId } from '../geo/reportScopeIds.js';

/** @param {string} scope */
export function normalizeReportScope(scope) {
  return normalizeReportScopeId(scope);
}
