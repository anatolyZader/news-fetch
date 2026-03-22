/**
 * Jerusalem Post (jpost.com) – NewsAPI (Event Registry) adapter.
 * Israeli English-language news.
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['jpost.com'],
    defaultSourceLabel: 'jpost.com',
    lang: 'eng',
  });
}
