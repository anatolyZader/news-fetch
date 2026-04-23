/**
 * Draft generator port interface (duck-typed).
 *
 * Implementations produce a concise Hebrew prose field report draft based on:
 * - structured state (authoritative)
 * - raw dialogue (tone/phrasing only)
 */

export class IReportBuildDraftGeneratorPort {
  /**
   * @param {object} structuredState
   * @param {Array<{role:'officer'|'bot', text:string, ts?:string}>} turnHistory
   * @returns {Promise<string>}
   */
  // eslint-disable-next-line no-unused-vars
  async generate(structuredState, turnHistory) {
    throw new Error('Not implemented');
  }
}

