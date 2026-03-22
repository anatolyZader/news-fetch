/**
 * KAN 11 (Israeli Public Broadcasting) – NewsAPI (Event Registry) adapter.
 * Source URIs: canonical and common variants (Event Registry may not index KAN yet – run business_modules/news-sites/input/discover-source-uris.js to verify).
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

const KAN_SOURCE_URIS = ['kan.org.il', 'www.kan.org.il', 'm.kan.org.il', 'kan11.co.il'];

/**
 * @param {{ apiKey: string, timezone?: string, mainNewsOnly?: boolean }} options
 * @returns {(opts: { date: string }) => Promise<Array<{ title: string, url: string, publishedAt: string, source: string, body: string }>>}
 */
export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: KAN_SOURCE_URIS,
    defaultSourceLabel: 'kan.org.il',
  });
}
