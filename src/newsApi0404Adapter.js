/**
 * 0404 (0404.co.il) – NewsAPI (Event Registry) adapter.
 * Hebrew news.
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['0404.co.il'],
    defaultSourceLabel: '0404.co.il',
  });
}
