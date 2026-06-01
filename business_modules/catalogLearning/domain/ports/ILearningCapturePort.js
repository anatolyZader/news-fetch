/**
 * Read learning-capture JSONL files from daily_reports/.
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
