/**
 * Append UI language to API URLs when not English.
 *
 * @param {string} url
 * @param {string} [lang]
 * @returns {string}
 */
export function withLang(url, lang) {
  const l = String(lang ?? '').trim().toLowerCase();
  if (!l || l === 'en') return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}lang=${encodeURIComponent(l)}`;
}
