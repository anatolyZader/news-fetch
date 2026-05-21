import { HOMEFRONT_KEYWORDS, HOMEFRONT_KEYWORDS_ARA, HOMEFRONT_KEYWORDS_RUS } from './homefrontKeywords.js';

const NORTH_LOCALITIES_HE = [
  'נהריה', 'קריית שמונה', 'צפת', 'מטולה', 'שלומי', 'מעלות תרשיחא',
  'חורפיש', 'מרגליות', 'יראון', 'אביבים', 'ראש פינה', 'חיפה',
];

/**
 * Default OSINT search query templates per language for citizen-voice gathering.
 * Operators or agents expand these with locality + platform-specific syntax.
 */
export function buildDefaultGatherQueries({ localities = NORTH_LOCALITIES_HE } = {}) {
  const heSample = HOMEFRONT_KEYWORDS.slice(0, 6);
  const arSample = HOMEFRONT_KEYWORDS_ARA.slice(0, 4);
  const ruSample = HOMEFRONT_KEYWORDS_RUS.slice(0, 4);

  const queries = [];

  for (const loc of localities) {
    for (const kw of heSample) {
      queries.push({ language: 'he', locality: loc, query: `"${loc}" ${kw} תושבים` });
      queries.push({ language: 'he', locality: loc, query: `"${loc}" ${kw} "ראיתי"` });
    }
    for (const kw of arSample) {
      queries.push({ language: 'ar', locality: loc, query: `${loc} ${kw}` });
    }
    for (const kw of ruSample) {
      queries.push({ language: 'ru', locality: loc, query: `${loc} ${kw}` });
    }
  }

  return queries;
}

export const DEFAULT_ACCESS_LIMITATIONS = Object.freeze([
  'X/Twitter may require authenticated access — unauthenticated fetchers often fail.',
  'TikTok often returns generic pages to non-app fetchers.',
  'Reddit may block automated fetchers on reddit.com and old.reddit.com.',
  'Facebook posts frequently require login; only some public pages are partially accessible.',
  'Public Telegram t.me/s/ channel pages may truncate posts and omit full dates.',
  'Some Hebrew forums (e.g. Rotter) may return HTTP 403 on direct fetch.',
]);
