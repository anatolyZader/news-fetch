/**
 * Cursorinfo (cursorinfo.co.il) – NewsAPI (Event Registry) adapter.
 * Israeli Russian-speaking community news (Russian).
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['cursorinfo.co.il'],
    defaultSourceLabel: 'cursorinfo.co.il',
    lang: 'rus',
  });
}
