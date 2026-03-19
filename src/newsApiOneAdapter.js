/**
 * One (one.co.il) – NewsAPI (Event Registry) adapter.
 * General Hebrew news.
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['one.co.il'],
    defaultSourceLabel: 'one.co.il',
  });
}
