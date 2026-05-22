import { createDataforseoTrendsAdapter } from './dataforseoTrendsAdapter.js';
import { createGoogleTrendsApiAdapter } from './googleTrendsApiAdapter.js';

/** @type {(keyof import('../../domain/ports/ISearchTrendsPort.js').ISearchTrendsPort)[]} */
const PORT_METHODS = ['interestOverTime', 'relatedQueries', 'interestByRegion'];

/**
 * @param {import('../../domain/ports/ISearchTrendsPort.js').ISearchTrendsPort} primary
 * @param {import('../../domain/ports/ISearchTrendsPort.js').ISearchTrendsPort} fallback
 * @returns {import('../../domain/ports/ISearchTrendsPort.js').ISearchTrendsPort}
 */
export function createFallbackTrendsPort(primary, fallback) {
  /** @type {import('../../domain/ports/ISearchTrendsPort.js').ISearchTrendsPort} */
  const port = {};
  for (const method of PORT_METHODS) {
    port[method] = async (opts) => {
      try {
        return await primary[method](opts);
      } catch {
        return fallback[method](opts);
      }
    };
  }
  return port;
}

/**
 * Prefer DataForSEO on servers where direct Google scraping is blocked; fall back to
 * google-trends-api when DataForSEO fails (e.g. billing / rate limits).
 * @returns {import('../../domain/ports/ISearchTrendsPort.js').ISearchTrendsPort}
 */
export function createTrendsPort() {
  const dfs = createDataforseoTrendsAdapter();
  const google = createGoogleTrendsApiAdapter();
  if (dfs) return createFallbackTrendsPort(dfs, google);
  return google;
}
