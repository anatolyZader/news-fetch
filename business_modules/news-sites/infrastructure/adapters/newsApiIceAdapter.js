/**
 * ICE (ice.co.il) – NewsAPI (Event Registry) adapter.
 * General Hebrew news.
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['ice.co.il'],
    defaultSourceLabel: 'ice.co.il',
  });
}
