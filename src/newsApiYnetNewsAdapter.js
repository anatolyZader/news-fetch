/**
 * Ynet News English (ynetnews.com) – NewsAPI (Event Registry) adapter.
 * Israeli English-language news (Ynet/Yediot group).
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['ynetnews.com'],
    defaultSourceLabel: 'ynetnews.com',
    lang: 'eng',
  });
}
