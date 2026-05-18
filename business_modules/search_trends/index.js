export { createSearchTrendsService } from './app/searchTrendsService.js';
export { registerSearchTrendsRoutes } from './input/searchTrendsRoutes.js';
export { TREND_DISTRICTS, TREND_DISTRICT_IDS, resolveTrendDistrict } from './domain/trendDistricts.js';
export { TREND_WINDOW_DAYS, normalizeTrendWindowDays } from './domain/trendWindowDays.js';
export {
  TREND_TOPIC_GROUPS,
  TREND_TOPIC_GROUP_IDS,
  normalizeTrendTopicGroup,
  filterTopicsByGroup,
} from './domain/trendTopicGroups.js';
