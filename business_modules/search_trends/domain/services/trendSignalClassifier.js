/**
 * Rule-based classification of Hebrew related-search queries → signal types + lexicon hits.
 */

import { matchComponentLexicon } from '../trendComponentLexicon.js';

/** @type {Array<{ type: string, patterns: string[], confidence: number }>} */
const SIGNAL_QUERY_RULES = [
  { type: 'compliance_enter_shelter', patterns: ['מקלט', 'ממ"ד', 'ממ״ד', 'התמגנות', 'לממד'], confidence: 0.85 },
  { type: 'early_warning_system_effective', patterns: ['אזעק', 'צופר', 'התרע', 'צבע אדום'], confidence: 0.8 },
  { type: 'compliance_follow_instructions', patterns: ['הנחיות', 'הוראות', 'פיקוד העורף'], confidence: 0.75 },
  { type: 'active_information_seeking', patterns: ['מה לעשות', 'איפה', 'הנחיות', 'מידע'], confidence: 0.7 },
  { type: 'educational_disruption', patterns: ['בתי ספר', 'גנים', 'סגירת', 'לימודים'], confidence: 0.85 },
  { type: 'evacuation_displacement', patterns: ['פינוי', 'פונים', 'עזיבה'], confidence: 0.8 },
  { type: 'fear_expression', patterns: ['חרדה', 'פחד', 'לחץ', 'מצוקה'], confidence: 0.85 },
  { type: 'help_seeking_behavior', patterns: ['תמיכה נפשית', 'סיוע', 'עזרה נפשית', 'טיפול'], confidence: 0.8 },
  { type: 'future_orientation_hope', patterns: ['תקווה', 'חוסן'], confidence: 0.65 },
  { type: 'future_orientation_despair', patterns: ['ייאוש', 'אין תקווה'], confidence: 0.75 },
  { type: 'blame_narrative', patterns: ['מי אשם', 'אשמה', 'כישלון'], confidence: 0.8 },
  { type: 'coordination_failure', patterns: ['כשל', 'בלגן', 'אין תיאום'], confidence: 0.75 },
  { type: 'accountability_demand_constructive', patterns: ['אחריות', 'ביקורת', 'משילות'], confidence: 0.7 },
  { type: 'hostage_uncertainty_distress', patterns: ['חטופים', 'שבויים', 'שחרור חטופים'], confidence: 0.85 },
  { type: 'community_volunteering', patterns: ['מתנדב', 'התנדבות', 'עזרה הדדית'], confidence: 0.75 },
  { type: 'deepfake_misinformation', patterns: ['פייק', 'הסתה', 'שקר', 'מידע שגוי'], confidence: 0.8 },
];

/**
 * @param {string} formattedValue
 * @returns {{ interest: number, momentum: 'rising'|'sustained' }}
 */
export function parseQueryInterestProxy(formattedValue) {
  const s = String(formattedValue ?? '').trim();
  const pct = s.match(/\+(\d+)%/);
  if (pct) {
    return {
      interest: Math.min(100, 40 + Number.parseInt(pct[1], 10) * 0.5),
      momentum: 'rising',
    };
  }
  const num = Number.parseInt(s.replace(/[^\d]/g, ''), 10);
  if (Number.isFinite(num) && num > 0) {
    return { interest: Math.min(100, num), momentum: 'sustained' };
  }
  if (/^(?:(?:\+)|(?:breakout))/i.test(s)) {
    return { interest: 65, momentum: 'rising' };
  }
  return { interest: 45, momentum: 'sustained' };
}

/**
 * @param {string} query
 * @returns {Array<{ type: string, confidence: number }>}
 */
export function classifyQuerySignals(query) {
  const q = String(query ?? '');
  /** @type {Map<string, number>} */
  const byType = new Map();

  for (const rule of SIGNAL_QUERY_RULES) {
    if (rule.patterns.some((p) => q.includes(p))) {
      const prev = byType.get(rule.type) ?? 0;
      byType.set(rule.type, Math.max(prev, rule.confidence));
    }
  }

  return [...byType.entries()]
    .map(([type, confidence]) => ({ type, confidence }))
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * @param {string} query
 * @param {string} [formattedValue]
 */
export function classifyTrendQuery(query, formattedValue = '') {
  const signalTypes = classifyQuerySignals(query);
  const lexiconHits = matchComponentLexicon(query);
  const { momentum } = parseQueryInterestProxy(formattedValue);

  let themeGroup = 'other';
  if (signalTypes.some((s) => /shelter|warning|compliance|early_warning/.test(s.type))) {
    themeGroup = 'emergency';
  } else if (signalTypes.some((s) => /educational|evacuation|displacement/.test(s.type))) {
    themeGroup = 'services';
  } else if (signalTypes.some((s) => /fear|help_seeking|hostage/.test(s.type))) {
    themeGroup = 'psycho';
  } else if (lexiconHits.some((h) => h.componentId === 'narrative')) {
    themeGroup = 'other';
  }

  return {
    signalTypes,
    lexiconHits,
    momentum,
    themeGroup,
  };
}
