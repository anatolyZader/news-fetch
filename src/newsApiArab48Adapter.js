/**
 * Arab48 (arab48.com) – NewsAPI (Event Registry) adapter.
 * Israeli Arab community news (Arabic).
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['arab48.com'],
    defaultSourceLabel: 'arab48.com',
    lang: 'ara',
  });
}
