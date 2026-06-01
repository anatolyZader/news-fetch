/**
 * Open-vocabulary observation extraction (no fixed signal_type enum).
 */
export class IOpenExtractionPort {
  constructor() {
    if (new.target === IOpenExtractionPort) {
      throw new Error('IOpenExtractionPort is abstract');
    }
  }

  /**
   * @param {Array<object>} articles normalized article objects with body/promptBody
   * @param {{ profile: string, contentKind?: string, onUsage?: Function, batchLabel?: string }} opts
   * @returns {Promise<Array<object>>} raw observation objects from LLM
   */
  async extractObservations(_articles, _opts) {
    throw new Error('not implemented');
  }
}
