/**
 * Mako – NewsAPI (Event Registry) adapter.
 * Source URIs from suggestSources; main-news filter via mainNewsFilter.js.
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

const MAKO_SOURCE_URIS = ['mako.co.il'];

/**
 * @param {{ apiKey: string, timezone?: string, mainNewsOnly?: boolean }} options
 * @returns {(opts: { date: string }) => Promise<Array<{ title: string, url: string, publishedAt: string, source: string, body: string }>>}
 */
export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: MAKO_SOURCE_URIS,
    defaultSourceLabel: 'mako.co.il',
  });
}
