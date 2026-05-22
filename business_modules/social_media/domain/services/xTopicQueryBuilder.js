import { createHash } from 'node:crypto';
import { conceptSearchTermsForLang } from './topicConceptNormalizer.js';
import { detectTopicPlaceClause } from './topicMatcher.js';

const LOCALITY_BY_LANG = Object.freeze({
  he: '(קריית שמונה OR נהריה OR צפת OR מטולה OR שלומי OR חיפה OR גליל OR גולן OR "ראש פינה" OR מעלות OR חורפיש OR מרגליות OR יראון OR אביבים OR "קריית ביאליק" OR עכו)',
  ar: '(حيفا OR عكا OR "كريات شmونة" OR نهاريا OR صفد OR "كريات بيالك" OR الجليل OR الجولان OR شفاعمرو)',
  ru: '("Kirьят-Шмона" OR Хайфа OR Нагария OR "Kirьят-Бялик" OR Цфат OR Галилея OR Голаны OR Акко)',
  en: '("Kiryat Shmona" OR "Kiryat Bialik" OR Haifa OR Naharia OR Acre OR "Upper Galilee" OR Galilee OR Golan OR Metula)',
});

/** Languages used for Social media tab X search. Includes en for Latin-script topics. */
export const SOCIAL_MEDIA_X_LANGS = Object.freeze(['he', 'en', 'ar']);

const LANG_CODES = Object.freeze(['he', 'ar', 'ru']);

/**
 * @param {string} topic
 */
export function topicSlug(topic) {
  const ascii = String(topic ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 32);
  if (ascii) return ascii;
  return `topic-${createHash('sha256').update(String(topic ?? '')).digest('hex').slice(0, 8)}`;
}

/**
 * Language-appropriate concept terms — avoids mixing loose English tokens with lang:he.
 * @param {string} topic
 * @param {string} lang
 */
function conceptTermsForLang(topic, lang) {
  const trimmed = String(topic ?? '').trim();
  if (!trimmed) return [];
  const terms = conceptSearchTermsForLang(trimmed, lang);
  if (terms.length) return terms.slice(0, 8);

  const sanitized = trimmed.replace(/'/g, '');
  return [`"${sanitized}"`];
}

/**
 * @param {string} topic
 * @param {string} lang
 */
function contextClause(topic, lang) {
  const parts = [];
  const place = detectTopicPlaceClause(topic, lang);
  if (place) parts.push(place);
  if (/port|נמל/i.test(topic)) {
    parts.push(lang === 'he' ? '(נמל OR port)' : '(port OR נמל)');
  }
  return parts.map((p) => ` ${p}`).join('');
}

/** Default query options for the Social media tab — no north-Israel geo filter. */
export const SOCIAL_MEDIA_X_QUERY_OPTS = Object.freeze({ socialMediaTab: true });

/**
 * @param {string} topic
 * @param {string} lang
 * @param {{ broad?: boolean, socialMediaTab?: boolean }} opts
 */
function localityClause(topic, lang, opts) {
  if (opts.socialMediaTab || opts.broad) {
    return contextClause(topic, lang);
  }
  const place = detectTopicPlaceClause(topic, lang);
  if (place) return ` ${place}`;
  return LOCALITY_BY_LANG[lang] ? ` ${LOCALITY_BY_LANG[lang]}` : '';
}

/**
 * @param {string} topic
 * @param {string} lang
 * @param {{ socialMediaTab?: boolean }} opts
 */
function langOperator(_topic, _lang, opts) {
  if (opts.socialMediaTab) {
    return '';
  }
  return ` lang:${_lang}`;
}

/**
 * @param {string} topic
 * @param {string[]} [langs]
 * @param {{ broad?: boolean, socialMediaTab?: boolean }} [opts]
 * @returns {Record<string, string>}
 */
export function buildXTopicQueries(topic, langs = LANG_CODES, opts = {}) {
  /** @type {Record<string, string>} */
  const queries = {};
  for (const lang of langs) {
    const terms = conceptTermsForLang(topic, lang);
    if (!terms.length) continue;
    const topicClause = `(${terms.join(' OR ')})`;
    const query = `${topicClause}${localityClause(topic, lang, opts)}${langOperator(topic, lang, opts)} -is:retweet`.trim();
    queries[lang] = query.length > 512 ? query.slice(0, 512) : query;
  }
  return queries;
}

/**
 * Last 3 calendar days ending at anchor (Asia/Jerusalem), newest first.
 * @param {string} [anchorDate] YYYY-MM-DD
 */
export function xThreeDayWindow(anchorDate) {
  const anchor = anchorDate ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const base = new Date(`${anchor}T12:00:00Z`);
  const dates = [];
  for (let i = 0; i < 3; i += 1) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return { target: anchor, dates };
}

/**
 * @param {string} date YYYY-MM-DD
 */
export function xSlotEndTime(date) {
  const todayUtc = new Date().toISOString().slice(0, 10);
  if (date === todayUtc) {
    const end = new Date(Date.now() - 60_000);
    return end.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  return `${date}T23:59:59Z`;
}

/**
 * @param {string[]} dates newest-first date strings
 */
export function xWindowBounds(dates) {
  const newest = dates[0];
  const oldest = dates[dates.length - 1];
  return {
    startTime: `${oldest}T00:00:00Z`,
    endTime: xSlotEndTime(newest),
  };
}
