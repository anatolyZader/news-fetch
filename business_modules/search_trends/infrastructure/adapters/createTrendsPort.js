import { createDataforseoTrendsAdapter } from './dataforseoTrendsAdapter.js';
import { createGoogleTrendsApiAdapter } from './googleTrendsApiAdapter.js';

/**
 * Prefer DataForSEO on servers where direct Google scraping is blocked.
 * @returns {import('../../domain/ports/ISearchTrendsPort.js').ISearchTrendsPort}
 */
export function createTrendsPort() {
  const dfs = createDataforseoTrendsAdapter();
  if (dfs) return dfs;
  return createGoogleTrendsApiAdapter();
}
