/**
 * Bokra (bokra.net) – NewsAPI (Event Registry) adapter.
 * Israeli Arab community news (Arabic).
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['bokra.net'],
    defaultSourceLabel: 'bokra.net',
    lang: 'ara',
  });
}
