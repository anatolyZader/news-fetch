/**
 * Read learning-capture JSONL files from business_modules/resilience_scorer/data/captures/.
 */
export class ILearningCapturePort {
  constructor() {
    if (new.target === ILearningCapturePort) {
      throw new Error('ILearningCapturePort is abstract');
    }
  }

  /** @returns {Promise<Array<object>>} */
  async loadCaptureRecords(_opts) {
    throw new Error('not implemented');
  }
}
