import { getMunicipalityDashboard } from './pboMunicipalityService.js';

/**
 * Stable read-model DTO for municipality dashboard API/UI.
 * @param {string} [districtId]
 * @param {object} [opts]
 */
export function buildMunicipalityDashboardDto(districtId, opts = {}) {
  const raw = getMunicipalityDashboard(districtId, opts);
  return {
    districtId: districtId ?? raw?.districtId ?? null,
    updatedAt: raw?.updatedAt ?? null,
    municipalities: raw?.municipalities ?? [],
    componentsOrder: raw?.componentsOrder ?? [],
    summary: raw?.summary ?? null,
  };
}
