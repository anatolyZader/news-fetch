/**
 * Kipa (kipa.co.il) – NewsAPI (Event Registry) adapter.
 * Religious news.
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['kipa.co.il'],
    defaultSourceLabel: 'kipa.co.il',
  });
}
