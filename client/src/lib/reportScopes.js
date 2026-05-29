/** Mirrors cross-cut-modules/geo/israelDistricts + reportScopeIds (client-safe copy). */

export const REPORT_SCOPE_ORDER = Object.freeze([
  'national',
  'north',
  'south',
  'jerusalem',
  'haifa',
  'dan',
]);

export const REPORT_SCOPES = new Set(REPORT_SCOPE_ORDER);

const LEGACY_ALIASES = Object.freeze({
  tel_aviv: 'dan',
  center: 'jerusalem',
});

/** @param {string} [raw] */
export function normalizeReportScopeId(raw) {
  const normalized = String(raw ?? 'national').trim().toLowerCase();
  const aliased = LEGACY_ALIASES[normalized] ?? normalized;
  return REPORT_SCOPES.has(aliased) ? aliased : 'national';
}

/** @param {string} scopeId */
export function isRegionalReportScope(scopeId) {
  return normalizeReportScopeId(scopeId) !== 'national';
}
