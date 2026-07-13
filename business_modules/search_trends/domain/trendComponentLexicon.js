/**
 * Per-component Hebrew substring lexicon for matching popular/rising related queries.
 * No extra Trends API calls — pattern match only.
 */

import { COMPONENT_IDS } from '../../resilience_scorer/index.js';

/** @type {Record<string, readonly string[]>} */
export const COMPONENT_LEXICON_PATTERNS = Object.freeze({
  narrative: [
    'נרטיב', 'סיפור', 'תקווה', 'ייאוש', 'מי אשם', 'אשמה', 'ניצחון', 'מחיר', 'מסר',
    'חטופים', 'שבויים', 'שחרור',
  ],
  information_communication: [
    'הנחיות', 'הודעה', 'התרעה', 'אזעקה', 'הוראות', 'מידע', 'הסברה', 'אפליקציה',
    'פיקוד העורף', 'התראות', 'מקלט',
  ],
  lifesaving_behavior: [
    'ממ"ד', 'ממ״ד', 'מקלט', 'מיגון', 'מען', 'התמגנות', 'צופר', 'אזעקות', 'ירי',
    'טילים', 'צבע אדום',
  ],
  functional_continuity: [
    'בתי ספר', 'גנים', 'לימודים', 'סגירת', 'עבודה', 'מסחר', 'אספקה', 'חנויות',
    'פינוי', 'פונים', 'שירותים',
  ],
  community_capital: [
    'מתנדב', 'קהילה', 'עזרה הדדית', 'תמיכה קהילתית', 'רשות', 'עמותה',
  ],
  leadership: [
    'ממשלה', 'ראש הממשלה', 'שר', 'רשות', 'משילות', 'תיאום', 'אחריות', 'אמון בממשלה',
    'כשל', 'ביקורת על',
  ],
  belonging_solidarity: [
    'אחדות', 'פילוג', 'מחלוקת', 'סולידריות', 'שכנים', 'דאגה הדדית',
  ],
  wellbeing_at_risk: [
    'חרדה', 'פחד', 'לחץ', 'מצוקה', 'נפש', 'טראומה', 'תמיכה נפשית', 'חוסן נפשי',
    'ילדים', 'קשישים',
  ],
});

/**
 * @param {string} text
 * @returns {Array<{ componentId: string, weight: number }>}
 */
export function matchComponentLexicon(text) {
  const q = String(text ?? '').trim();
  if (!q) return [];

  /** @type {Array<{ componentId: string, weight: number }>} */
  const hits = [];

  for (const componentId of COMPONENT_IDS) {
    const patterns = COMPONENT_LEXICON_PATTERNS[componentId] ?? [];
    let matchCount = 0;
    for (const p of patterns) {
      if (q.includes(p)) matchCount += 1;
    }
    if (matchCount > 0) {
      hits.push({
        componentId,
        weight: Math.min(1, 0.35 + matchCount * 0.2),
      });
    }
  }

  return hits.sort((a, b) => b.weight - a.weight);
}
