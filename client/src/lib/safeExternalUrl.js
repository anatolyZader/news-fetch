/**
 * Guard for raw external hrefs sourced from scraped/user-submitted URLs (no JSX — safe for Node tests).
 */

import { isSafeMarkdownHref } from './safeMarkdownHref.js';

/**
 * @param {unknown} url
 * @returns {string | null} the URL if safe to render as an external href, else null
 */
export function safeExternalUrl(url) {
  const raw = String(url ?? '').trim();
  if (!raw || raw === '(no url)' || raw === 'null') return null;
  return isSafeMarkdownHref(raw) ? raw : null;
}
