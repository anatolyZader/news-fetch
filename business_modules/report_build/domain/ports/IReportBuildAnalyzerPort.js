/**
 * Analyzer port interface (duck-typed).
 *
 * Implementations analyze the full turn history and emit:
 * - `structured`: normalized structured state
 * - `assessment`: model-proposed assessment including `topQuestions`
 */

export class IReportBuildAnalyzerPort {
  /**
   * @param {Array<{role:'officer'|'bot', text:string, ts?:string}>} turnHistory
   * @param {string} senderName
   * @returns {Promise<{ structured: object, assessment: { topQuestions?: string[] } }>}
   */
  // eslint-disable-next-line no-unused-vars
  async analyzeTurnHistory(turnHistory, senderName) {
    throw new Error('Not implemented');
  }
}

