/**
 * Ynet.co.il – NewsAPI (Event Registry) adapter.
 * Source URIs from suggestSources; main-news filter via mainNewsFilter.js.
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

const YNET_SOURCE_URIS = [
  'ynet.co.il',
  'pplus.ynet.co.il',
  'livegame.ynet.co.il',
  'xnet.ynet.co.il',
  'yedioth.ynet.co.il',
  'z.ynet.co.il',
];

/**
 * @param {{ apiKey: string, timezone?: string, mainNewsOnly?: boolean }} options
 * @returns {(opts: { date: string }) => Promise<Array<{ title: string, url: string, publishedAt: string, source: string, body: string }>>}
 */
export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: YNET_SOURCE_URIS,
    defaultSourceLabel: 'ynet.co.il',
  });
}
