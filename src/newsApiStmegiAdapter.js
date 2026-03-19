/**
 * Stmegi (stmegi.com) – NewsAPI (Event Registry) adapter.
 * Israeli Russian-speaking community portal (Russian).
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['stmegi.com'],
    defaultSourceLabel: 'stmegi.com',
    lang: 'rus',
  });
}
