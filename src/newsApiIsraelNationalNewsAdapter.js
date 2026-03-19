/**
 * Israel National News English (israelnationalnews.com) – NewsAPI (Event Registry) adapter.
 * Arutz 7 English-language news (national-religious perspective).
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['israelnationalnews.com'],
    defaultSourceLabel: 'israelnationalnews.com',
    lang: 'eng',
  });
}
