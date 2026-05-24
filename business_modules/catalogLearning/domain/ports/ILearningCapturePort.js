/**
 * Read learning-capture JSONL files from reports/.
 */
export class ILearningCapturePort {
  constructor() {
    if (new.target === ILearningCapturePort) {
      throw new Error('ILearningCapturePort is abstract');
    }
  }

  /** @returns {Promise<Array<object>>} */
  // eslint-disable-next-line no-unused-vars
  async loadCaptureRecords(_opts) {
    throw new Error('not implemented');
  }
}
