/**
 * Globes (globes.co.il) – NewsAPI (Event Registry) adapter.
 * Business and financial news.
 */
import { createNewsApiArticlesFetcher as createFetcher } from './newsApiAdapterFactory.js';

export function createNewsApiArticlesFetcher(options) {
  return createFetcher({
    ...options,
    sourceUris: ['globes.co.il'],
    defaultSourceLabel: 'globes.co.il',
  });
}
