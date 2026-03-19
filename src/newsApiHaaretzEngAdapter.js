/**
 * Haaretz English (haaretz.com) – NewsAPI (Event Registry) adapter.
 * Israeli English-language news (Haaretz group).
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['haaretz.com'],
    defaultSourceLabel: 'haaretz.com',
    lang: 'eng',
  });
}
