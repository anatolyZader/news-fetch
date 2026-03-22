/**
 * 9TV Israel (9tv.co.il) – NewsAPI (Event Registry) adapter.
 * Israeli Russian-speaking community TV news (Russian).
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['9tv.co.il'],
    defaultSourceLabel: '9tv.co.il',
    lang: 'rus',
  });
}
