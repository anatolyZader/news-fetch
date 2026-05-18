/**
 * Homefront-aligned search topics for Google Trends dashboards.
 * Each topic maps to one keyword (Hebrew) for the Trends API.
 */

/** @typedef {{ id: string, keyword: string, labelKey: string, group: string }} TrendTopic */

/** @type {readonly TrendTopic[]} */
export const TREND_QUERY_TOPICS = Object.freeze([
  { id: 'alerts', keyword: 'אזעקות', labelKey: 'trends.topic.alerts', group: 'emergency' },
  { id: 'home_front', keyword: 'פיקוד העורף', labelKey: 'trends.topic.homeFront', group: 'emergency' },
  { id: 'safe_room', keyword: 'ממ"ד', labelKey: 'trends.topic.safeRoom', group: 'emergency' },
  { id: 'evacuation', keyword: 'פינוי', labelKey: 'trends.topic.evacuation', group: 'services' },
  { id: 'schools', keyword: 'סגירת בתי ספר', labelKey: 'trends.topic.schools', group: 'services' },
  { id: 'anxiety', keyword: 'חרדה', labelKey: 'trends.topic.anxiety', group: 'psycho' },
  { id: 'mental_support', keyword: 'תמיכה נפשית', labelKey: 'trends.topic.mentalSupport', group: 'psycho' },
  { id: 'resilience', keyword: 'חוסן נפשי', labelKey: 'trends.topic.resilience', group: 'psycho' },
]);

export const TREND_TOPIC_BY_ID = Object.freeze(
  Object.fromEntries(TREND_QUERY_TOPICS.map((t) => [t.id, t])),
);

/** Keywords sent to interestOverTime (max 5 per Google request — we use all 8 in one call; API supports 5). */
export const PRIMARY_TREND_KEYWORDS = TREND_QUERY_TOPICS.slice(0, 5).map((t) => t.keyword);

/** Second batch for extended series when needed. */
export const SECONDARY_TREND_KEYWORDS = TREND_QUERY_TOPICS.slice(5).map((t) => t.keyword);
