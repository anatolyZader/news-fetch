/**
 * Kikar Hashabat (kikar.co.il) – NewsAPI (Event Registry) adapter.
 * Haredi community news.
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['kikar.co.il'],
    defaultSourceLabel: 'kikar.co.il',
  });
}
