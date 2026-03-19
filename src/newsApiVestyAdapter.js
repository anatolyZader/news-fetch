/**
 * Vesty Israel (vesty.co.il) – NewsAPI (Event Registry) adapter.
 * Israeli Russian-speaking community newspaper (Russian).
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['vesty.co.il'],
    defaultSourceLabel: 'vesty.co.il',
    lang: 'rus',
  });
}
