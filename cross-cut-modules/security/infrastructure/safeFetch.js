import { validateUserFetchUrl, assertResolvedHostSafe } from '../domain/services/ssrfGuard.js';

const DEFAULT_MAX_REDIRECTS = 3;

async function validateFetchTarget(rawUrl) {
  const url = validateUserFetchUrl(rawUrl);
  const parsed = new URL(url);
  await assertResolvedHostSafe(parsed.hostname);
  return url;
}

/**
 * Fetch a user-supplied URL with SSRF validation on each redirect hop.
 * @param {string} rawUrl
 * @param {RequestInit & { maxRedirects?: number }} [opts]
 * @returns {Promise<Response>}
 */
export async function safeFetch(rawUrl, opts = {}) {
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let url = await validateFetchTarget(rawUrl);
  let init = { ...opts };
  delete init.maxRedirects;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const response = await fetch(url, { ...init, redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return response;
      }
      if (hop >= maxRedirects) {
        throw new Error('too many redirects');
      }
      url = await validateFetchTarget(new URL(location, url).toString());
      init = { ...init, method: 'GET', body: undefined };
      continue;
    }
    return response;
  }

  throw new Error('too many redirects');
}
