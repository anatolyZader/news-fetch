/**
 * NewsRU Israel (newsru.co.il) – NewsAPI (Event Registry) adapter.
 * Israeli Russian-speaking community news (Russian).
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['newsru.co.il'],
    defaultSourceLabel: 'newsru.co.il',
    lang: 'rus',
  });
}
