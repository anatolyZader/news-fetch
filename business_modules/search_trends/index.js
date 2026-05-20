export { createSearchTrendsService } from './app/searchTrendsService.js';
export { registerSearchTrendsRoutes } from './input/searchTrendsRoutes.js';
export {
  TREND_DISTRICTS,
  TREND_DISTRICT_IDS,
  TREND_DISTRICT_FILTER_ORDER,
  resolveTrendDistrict,
} from './domain/trendDistricts.js';
export {
  ISRAEL_DISTRICT_FILTER_ORDER,
  ISRAEL_REGIONAL_DISTRICT_ORDER,
  listIsraelDistrictsForApi,
  normalizeIsraelDistrictId,
  normalizeIsraelDistrictLabelKey,
  normalizeIsraelDistrictRefs,
} from '../../cross-cut-modules/geo/israelDistricts.js';
export { TREND_WINDOW_DAYS, normalizeTrendWindowDays } from './domain/trendWindowDays.js';
export {
  TREND_TOPIC_GROUPS,
  TREND_TOPIC_GROUP_IDS,
  normalizeTrendTopicGroup,
  filterTopicsByGroup,
} from './domain/trendTopicGroups.js';
