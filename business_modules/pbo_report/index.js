/**
 * Public facade for the pbo_report module — PBO municipal dashboards
 * (Excel event logs) and regional daily markdown reports, plus the shared
 * district registry (config/pboDistrictRegistry.json).
 */
export { getMunicipalityDashboard, COMPONENTS_ORDER } from './app/pboMunicipalityService.js';
export { buildMunicipalityDashboardDto } from './app/municipalityDashboardReadModel.js';
export { createPboRegionalDailyService } from './app/pboRegionalDailyService.js';
export { createPboReportRegionalFsAdapter } from './infrastructure/adapters/pboReportRegionalFsAdapter.js';
export { REGIONAL_PBO_REGION_IDS } from './domain/value_objects/regionalPboRegions.js';
export {
  normalizePboDistrictId,
  getPboDistrictConfig,
  listPboDistrictIds,
  listPboDistrictsForApi,
  resolveLocalExcelPaths,
  districtHasLocalPboData,
  resolveRegionalInboxDir,
  regionalSubregionsForDistrict,
  resetPboDistrictRegistryCache,
} from './infrastructure/pboDistrictRegistry.js';
