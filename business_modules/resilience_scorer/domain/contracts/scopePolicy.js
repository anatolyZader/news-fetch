/**
 * Report scope id normalization for assessments and artifacts.
 *
 * Pipeline position: client-safe isomorphic — applied when resolving report
 * scope from API params, CLI flags, and stored assessment metadata.
 *
 * Owns: thin wrapper around shared geo scope normalization.
 * Does NOT: geo enrichment, scope partition logic, or artifact path layout.
 *
 * Key collaborators: cross-cut-modules/geo/reportScopeIds.js,
 * reportRoutes.js, assessSignalsCli.js.
 */
import { normalizeReportScopeId } from '../../../../cross-cut-modules/geo/reportScopeIds.js';

/**
 * Normalize a raw scope string to a canonical report_scope_id.
 * @param {string} scope
 * @returns {string}
 */
export function normalizeReportScope(scope) {
  return normalizeReportScopeId(scope);
}
