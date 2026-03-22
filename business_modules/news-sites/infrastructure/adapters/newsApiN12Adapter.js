/**
 * N12 (Channel 12 / Hevrat HaHadashot) – NewsAPI (Event Registry) adapter.
 * Source URIs: canonical and common variants (Event Registry may not index N12 yet – run scripts/discover-source-uris.js to verify).
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

const N12_SOURCE_URIS = ['n12.co.il', 'www.n12.co.il', 'm.n12.co.il', '12tv.co.il'];

/**
 * @param {{ apiKey: string, timezone?: string, mainNewsOnly?: boolean }} options
 * @returns {(opts: { date: string }) => Promise<Array<{ title: string, url: string, publishedAt: string, source: string, body: string }>>}
 */
export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: N12_SOURCE_URIS,
    defaultSourceLabel: 'n12.co.il',
  });
}
