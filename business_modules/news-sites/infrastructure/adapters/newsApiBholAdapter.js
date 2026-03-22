/**
 * B'Hadrei Haredim / Bhol (bhol.co.il) – NewsAPI (Event Registry) adapter.
 * Haredi community news.
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['bhol.co.il'],
    defaultSourceLabel: 'bhol.co.il',
  });
}
