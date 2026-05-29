/**
 * Resilience report scope ids and report filename prefixes.
 * Regional scopes align with ISRAEL_REGIONAL_DISTRICT_ORDER.
 */

import {
  ISRAEL_NATIONAL_DISTRICT_ID,
  ISRAEL_REGIONAL_DISTRICT_ORDER,
  normalizeIsraelDistrictId,
} from './israelDistricts.js';

export { ISRAEL_REGIONAL_DISTRICT_ORDER as REGIONAL_REPORT_SCOPE_IDS };

/** @param {string} [scopeId] */
export function normalizeReportScopeId(scopeId) {
  const id = normalizeIsraelDistrictId(scopeId);
  if (id === ISRAEL_NATIONAL_DISTRICT_ID) return ISRAEL_NATIONAL_DISTRICT_ID;
  if (ISRAEL_REGIONAL_DISTRICT_ORDER.includes(id)) return id;
  return ISRAEL_NATIONAL_DISTRICT_ID;
}

/** @param {string} scopeId */
export function isRegionalReportScope(scopeId) {
  const id = normalizeReportScopeId(scopeId);
  return id !== ISRAEL_NATIONAL_DISTRICT_ID;
}

/**
 * @param {string} scopeId
 * @returns {string} e.g. resilience-report | resilience-report-north
 */
export function reportFilePrefix(scopeId) {
  const id = normalizeReportScopeId(scopeId);
  if (id === ISRAEL_NATIONAL_DISTRICT_ID) return 'resilience-report';
  return `resilience-report-${id}`;
}

/** @param {string} filename */
export function isRegionalReportFilename(filename) {
  const f = String(filename ?? '');
  return ISRAEL_REGIONAL_DISTRICT_ORDER.some((id) => f.startsWith(`resilience-report-${id}-`));
}
