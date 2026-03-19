/**
 * Calcalist (calcalist.co.il) – NewsAPI (Event Registry) adapter.
 * Business and economics news.
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['calcalist.co.il'],
    defaultSourceLabel: 'calcalist.co.il',
  });
}
