import { createGoogleTrendsApiAdapter } from './googleTrendsApiAdapter.js';
import { createSerpApiTrendsAdapter } from './serpApiTrendsAdapter.js';

/**
 * Prefer SerpAPI on servers where direct Google scraping is blocked.
 * @returns {import('../../domain/ports/ISearchTrendsPort.js').ISearchTrendsPort}
 */
export function createTrendsPort() {
  const serp = createSerpApiTrendsAdapter();
  if (serp) return serp;
  return createGoogleTrendsApiAdapter();
}
