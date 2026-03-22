/**
 * Arutz 7 / Israel National News (inn.co.il) – NewsAPI (Event Registry) adapter.
 * National-religious / right-wing perspective.
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['inn.co.il'],
    defaultSourceLabel: 'inn.co.il',
  });
}
