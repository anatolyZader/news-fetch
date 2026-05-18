/** @typedef {{ id: string, labelKey: string }} TrendTopicGroup */

/** @type {readonly TrendTopicGroup[]} */
export const TREND_TOPIC_GROUPS = Object.freeze([
  { id: 'all', labelKey: 'trends.group.all' },
  { id: 'emergency', labelKey: 'trends.group.emergency' },
  { id: 'services', labelKey: 'trends.group.services' },
  { id: 'psycho', labelKey: 'trends.group.psycho' },
]);

export const TREND_TOPIC_GROUP_IDS = new Set(TREND_TOPIC_GROUPS.map((g) => g.id));

/**
 * @param {string} [raw]
 * @returns {string}
 */
export function normalizeTrendTopicGroup(raw) {
  const id = String(raw ?? 'all').trim().toLowerCase();
  return TREND_TOPIC_GROUP_IDS.has(id) ? id : 'all';
}

/**
 * @param {Array<{ group?: string }>} topics
 * @param {string} groupId
 */
export function filterTopicsByGroup(topics, groupId) {
  const g = normalizeTrendTopicGroup(groupId);
  if (g === 'all') return topics;
  return topics.filter((t) => t.group === g);
}
