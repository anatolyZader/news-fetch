import {
  COMPONENT_TO_CATEGORY,
  EMERGENCY_CATEGORY_IDS,
} from '../value_objects/emergencyCategories.js';

const KEYWORD_CATEGORY_RULES = [
  { category: 'alerts_shelter', re: /ממ"ד|מקלט|מרחב מוגן|אזעק|shelter|safe room|מחסה/i },
  { category: 'threat_perception', re: /כטב"מ|רחפן|drone|uav|איום|threat|פיצוץ/i },
  { category: 'compliance_behavior', re: /נכנס|מקלט|הנחיות|compliance|enter.*shelter/i },
  { category: 'information_trust', re: /התרעה|איחור|מאוחר|trust|alert.*late|זמן.*התרע/i },
  { category: 'community_resilience', re: /סולידר|מתנדב|קהיל|volunteer|community|זולת/i },
  { category: 'distress_fear', re: /פחד|חרד|עייפ|frustrat|מקומם|stress|fear|עייפות/i },
];

/**
 * @param {object} finding
 * @returns {string}
 */
export function categorizeFinding(finding) {
  const component = String(finding?.resilience_component ?? '').trim();
  if (component && COMPONENT_TO_CATEGORY[component]) {
    return COMPONENT_TO_CATEGORY[component];
  }

  const text = [
    finding?.quote_original,
    finding?.behavior_or_emotion,
    finding?.relevance_reason,
  ].filter(Boolean).join(' ');

  for (const rule of KEYWORD_CATEGORY_RULES) {
    if (rule.re.test(text)) return rule.category;
  }

  return 'other';
}

/**
 * @param {object[]} findings
 * @returns {Map<string, object[]>}
 */
export function groupFindingsByCategory(findings) {
  const groups = new Map(EMERGENCY_CATEGORY_IDS.map((id) => [id, []]));
  for (const finding of findings ?? []) {
    const cat = categorizeFinding(finding);
    groups.get(cat)?.push(finding);
    if (!groups.has(cat)) groups.set(cat, [finding]);
  }
  return groups;
}
