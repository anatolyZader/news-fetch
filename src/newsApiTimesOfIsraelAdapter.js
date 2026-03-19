/**
 * Times of Israel (timesofisrael.com) – NewsAPI (Event Registry) adapter.
 * Israeli English-language news.
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['timesofisrael.com'],
    defaultSourceLabel: 'timesofisrael.com',
    lang: 'eng',
  });
}
