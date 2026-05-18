/**
 * Port for fetching raw Google Trends API payloads.
 */

/**
 * @typedef {object} InterestOverTimeResult
 * @property {Array<{ date: string, values: Record<string, number> }>} series
 * @property {string[]} keywords
 */

/**
 * @typedef {object} RelatedQueriesResult
 * @property {Array<{ query: string, value: number, formattedValue: string }>} rising
 * @property {Array<{ query: string, value: number, formattedValue: string }>} top
 */

/**
 * @typedef {object} RegionInterestRow
 * @property {string} geoCode
 * @property {string} geoName
 * @property {number} value
 */

export class ISearchTrendsPort {
  /**
   * @param {{ keywords: string[], geo: string, startTime: Date, endTime: Date }} opts
   * @returns {Promise<InterestOverTimeResult>}
   */
  async interestOverTime(_opts) {
    throw new Error('ISearchTrendsPort.interestOverTime not implemented');
  }

  /**
   * @param {{ keyword: string, geo: string, startTime: Date, endTime: Date }} opts
   * @returns {Promise<RelatedQueriesResult>}
   */
  async relatedQueries(_opts) {
    throw new Error('ISearchTrendsPort.relatedQueries not implemented');
  }

  /**
   * @param {{ keyword: string, startTime: Date, endTime: Date }} opts
   * @returns {Promise<RegionInterestRow[]>}
   */
  async interestByRegion(_opts) {
    throw new Error('ISearchTrendsPort.interestByRegion not implemented');
  }
}
