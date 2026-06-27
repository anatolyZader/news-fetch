import { authFetch } from './authFetch.js';
import { withLang } from './localeFetch.js';

/**
 * Authenticated fetch with UI language appended for server-side localization.
 *
 * @param {string} url
 * @param {{
 *   lang?: string,
 *   getIdToken?: (opts?: { forceRefresh?: boolean }) => Promise<string|null>,
 *   getAppCheckToken?: () => Promise<string|null>,
 *   method?: string,
 *   body?: unknown,
 *   headers?: HeadersInit,
 * }} opts
 */
export async function localizedAuthFetch(url, opts = {}) {
  const { lang, ...rest } = opts;
  return authFetch(withLang(url, lang), rest);
}
