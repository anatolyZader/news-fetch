// xHomefrontClusterQueries.js - build X search queries for homefront clusters

import { xSlotEndTime } from './xTopicQueryBuilder.js';

/** Default languages for daily homefront X sweep (matches /x-3-full). */
export const DAILY_X_LANGS = Object.freeze(['he', 'ar', 'ru']);

export const DAILY_X_CLUSTERS = Object.freeze(['A', 'B']);

/** North-Israel locality clauses (from /x-3-full). */
export const NORTH_LOCALITY_BY_LANG = Object.freeze({
  he: '("קריית שמונה" OR נהריה OR צפת OR מטולה OR שלומי OR חיפה OR "ראש פינה" OR מעלות OR חורפיש OR מרגליות OR יראון OR אביבים OR "קריית ביאליק" OR עכו OR "רמת הגולן" OR "הגליל העליון" OR "הגליל המערבי")',
  ar: '(حيفا OR عكا OR "كريات شمونة" OR نهاريا OR صفد OR "كريات بيالك" OR شفاعمرو OR "الجليل الأعلى" OR "الجليل الأسفل" OR طمرة OR سخنين OR "كفر كنا")',
  ru: '("Кирьят-Шмона" OR Хайфа OR Нагария OR "Кирьят-Бялик" OR Цфат OR Галилея OR Голаны OR Акко)',
  en: '("Kiryat Shmona" OR Haifa OR Naharia OR Acre OR Galilee OR Golan OR Metula)',
});

const CLUSTER_TERMS = Object.freeze({
  he: {
    A: '(אזעקה OR "צבע אדום" OR מקלט OR "מרחב מוגן" OR "פיקוד העורף" OR פינוי OR מפונים OR התראה OR "בתי הספר" OR "למידה מרחוק" OR חירום OR "הוראות העורף" OR נפילה OR שיגורים OR "מד״א" OR חילוץ)',
    B: '(חרדה OR פחד OR "פוסט טראומה" OR PTSD OR "מצב נפשי" OR "תמיכה נפשית" OR טראומה OR חוסן OR פסיכולוג OR קשישים OR ילדים OR נוער OR מוגבלות OR "צרכים מיוחדים" OR קהילה OR התנדבות OR "עזרה הדדית")',
  },
  ar: {
    A: '("صفارة الإنذار" OR إنذار OR ملجأ OR "غرفة آمنة" OR إخلاء OR نازحون OR مدارس OR طوارئ OR "قيادة الجبهة الداخلية" OR قصف OR صواريخ OR "تعليم عن بعد")',
    B: '(قلق OR خوف OR "صدمة نفسية" OR "صحة نفسية" OR "دعم نفسي" OR صمود OR مسنون OR أطفال OR "ذوو الاحتياجات الخاصة" OR "نساء حوامل" OR مجتمع OR تطوع)',
  },
  ru: {
    A: '(сирена OR тревога OR убежище OR "безопасная комната" OR эвакуация OR "командование тылом" OR школы OR "дистанционное обучение" OR "ракетная тревога" OR обстрел OR "чрезвычайная ситуация")',
    B: '(страх OR тревожность OR ПТСР OR "посттравматическое" OR "психологическая помощь" OR "психическое здоровье" OR устойчивость OR пожилые OR дети OR инвалиды OR сообщество OR волонтёры)',
  },
  en: {
    A: '("air raid" OR siren OR alarm OR shelter OR "safe room" OR evacuation OR evacuees OR "Home Front Command" OR "remote learning" OR "rocket fire" OR "emergency")',
    B: '(anxiety OR fear OR PTSD OR trauma OR "mental health" OR resilience OR coping OR psychologist OR elderly OR disabled OR community OR volunteers OR "mutual aid")',
  },
});

const MAX_QUERY_LEN = 512;

/**
 * @param {string} lang
 */
function xLangOperator(lang) {
  return ` lang:${lang}`;
}

/**
 * Trim cluster OR-terms (never locality) until query fits X limit.
 * @param {string[]} terms
 * @param {number} maxTermsLen
 */
function trimTermsToFit(terms, maxTermsLen) {
  const joined = terms.join(' OR ');
  if (`(${joined})`.length <= maxTermsLen) return terms;
  const out = [...terms];
  while (out.length > 2 && `(${out.join(' OR ')})`.length > maxTermsLen) {
    out.pop();
  }
  return out;
}

/**
 * @param {{ lang: string, cluster: 'A'|'B', north?: boolean }} opts
 * @returns {string}
 */
export function buildHomefrontClusterQuery({ lang, cluster, north = false }) {
  const termsRaw = CLUSTER_TERMS[lang]?.[cluster];
  if (!termsRaw) return '';

  const locality = north && NORTH_LOCALITY_BY_LANG[lang] ? ` ${NORTH_LOCALITY_BY_LANG[lang]}` : '';
  const langOp = xLangOperator(lang);
  const suffix = `${locality}${langOp} -is:retweet`;
  const maxTopicLen = MAX_QUERY_LEN - suffix.length - 2;

  const inner = termsRaw.startsWith('(') ? termsRaw.slice(1, -1) : termsRaw;
  let termParts = inner.split(/\s+OR\s+/).map((t) => t.trim()).filter(Boolean);
  termParts = trimTermsToFit(termParts, maxTopicLen);
  const topicClause = `(${termParts.join(' OR ')})`;
  const query = `${topicClause}${suffix}`.trim();
  return query.length > MAX_QUERY_LEN ? query.slice(0, MAX_QUERY_LEN) : query;
}

/**
 * @param {string} anchorDate YYYY-MM-DD
 * @param {number} days
 * @returns {string[]}
 */
export function assessmentWindowDates(anchorDate, days = 3) {
  const base = new Date(`${anchorDate}T12:00:00Z`);
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * @param {{
 *   anchorDate: string,
 *   days?: number,
 *   north?: boolean,
 *   langs?: string[],
 *   clusters?: string[],
 * }} opts
 * @returns {Array<{ date: string, lang: string, cluster: string, query: string, startTime: string, endTime: string }>}
 */
export function buildDailyXSearchSlots({
  anchorDate,
  days = 3,
  north = false,
  langs = DAILY_X_LANGS,
  clusters = DAILY_X_CLUSTERS,
}) {
  const dates = assessmentWindowDates(anchorDate, days);
  /** @type {Array<{ date: string, lang: string, cluster: string, query: string, startTime: string, endTime: string }>} */
  const slots = [];

  for (const date of dates) {
    const startTime = `${date}T00:00:00Z`;
    const endTime = xSlotEndTime(date);
    for (const lang of langs) {
      if (!CLUSTER_TERMS[lang]) continue;
      for (const cluster of clusters) {
        const query = buildHomefrontClusterQuery({ lang, cluster, north });
        if (!query) continue;
        slots.push({ date, lang, cluster, query, startTime, endTime });
      }
    }
  }
  return slots;
}

/** Regex hints for north relevance on Telegram text/channel locality. */
const NORTH_TEXT_HINTS = [
  /קריית שמונה|נהריה|צפת|מטולה|שלומי|חיפה|עכו|גליל|גולן|מעלות|חורפיש|מרגליות/i,
  /حيفا|عكا|شمونة|نهاريا|صفد|الجليل/i,
  /Хайфа|Нагария|Галил|Голан|Цфат|Акко|Кирьят/i,
  /Haifa|Nahari|Galilee|Golan|Kiryat Shmona|Metula|Acre/i,
];

/**
 * @param {string} text
 * @param {{ locality?: string, coverageArea?: string[] }} [channel]
 */
export function isNorthRelevantText(text, channel = {}) {
  const hay = [
    text,
    channel.locality ?? '',
    ...(channel.coverageArea ?? []),
  ].join(' ');
  return NORTH_TEXT_HINTS.some((re) => re.test(hay));
}
