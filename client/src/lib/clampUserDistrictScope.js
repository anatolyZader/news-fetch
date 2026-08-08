import { ISRAEL_REGIONAL_DISTRICT_ORDER, normalizeIsraelDistrictId } from './israelDistricts.js';
import { normalizeReportScopeId } from './reportScopes.js';

/**
 * @param {string} scopeId
 * @param {{ enforcementEnabled?: boolean, unrestricted?: boolean, districtIds?: string[] } | null | undefined} access
 * @returns {boolean}
 */
export function isDistrictScopeAllowed(scopeId, access) {
  if (!access?.enforcementEnabled || access.unrestricted) return true;
  const id = normalizeReportScopeId(scopeId);
  if (id === 'national') return true;
  return (access.districtIds ?? []).includes(id);
}

/**
 * @param {string} scopeId
 * @param {{ enforcementEnabled?: boolean, unrestricted?: boolean, districtIds?: string[] } | null | undefined} access
 * @returns {string}
 */
export function clampReportScopeId(scopeId, access) {
  const id = normalizeReportScopeId(scopeId);
  if (isDistrictScopeAllowed(id, access)) return id;
  if (isDistrictScopeAllowed('national', access)) return 'national';
  const first = access?.districtIds?.[0];
  return first ?? 'national';
}

/**
 * @param {string} districtId
 * @param {{ enforcementEnabled?: boolean, unrestricted?: boolean, districtIds?: string[] } | null | undefined} access
 * @returns {string}
 */
export function clampRegionalDistrictId(districtId, access) {
  const id = normalizeIsraelDistrictId(districtId);
  const regional = id === 'national' ? ISRAEL_REGIONAL_DISTRICT_ORDER[0] : id;
  if (isDistrictScopeAllowed(regional, access)) return regional;
  return access?.districtIds?.[0] ?? ISRAEL_REGIONAL_DISTRICT_ORDER[0];
}

/**
 * Append `district` query param for regional user scope (national leaves URL unchanged).
 * @param {string} url
 * @param {string} [userScope]
 * @returns {string}
 */
export function withUserDistrictQuery(url, userScope) {
  const id = normalizeReportScopeId(userScope);
  if (id === 'national') return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}district=${encodeURIComponent(id)}`;
}
