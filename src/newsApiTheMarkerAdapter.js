/**
 * TheMarker (themarker.com) – NewsAPI (Event Registry) adapter.
 * Business and economics news (Haaretz group).
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['themarker.com'],
    defaultSourceLabel: 'themarker.com',
  });
}
