/**
 * Central filter for "main news" articles. Excludes URLs that indicate non-news sections
 * (sports, entertainment, food, activism, gossip). Used by all NewsAPI site adapters.
 * Change this file to affect filtering across all adapters.
 */

/** URL path segments that indicate non–main-news (sports, entertainment, lifestyle, etc.). */
export const NON_NEWS_PATH_SEGMENTS = [
  '/sport',
  '/entertainment',
  '/food',
  '/activism',
  '/rechilut',
];

/**
 * Returns true if the article URL is main-news only (news, economy); excludes sports, entertainment, food, activism.
 * @param {string} url
 * @returns {boolean}
 */
export function isMainNewsUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return !NON_NEWS_PATH_SEGMENTS.some((seg) => lower.includes(seg));
}
