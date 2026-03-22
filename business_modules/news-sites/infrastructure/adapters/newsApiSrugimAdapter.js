/**
 * Srugim (srugim.co.il) – NewsAPI (Event Registry) adapter.
 * Religious-Zionist community news.
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['srugim.co.il'],
    defaultSourceLabel: 'srugim.co.il',
  });
}
