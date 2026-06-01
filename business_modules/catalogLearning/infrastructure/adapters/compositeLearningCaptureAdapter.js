/**
 * Merge OOV JSONL captures and open observation bundles for gap reports.
 */
import { ILearningCapturePort } from '../../domain/ports/ILearningCapturePort.js';

export class CompositeLearningCaptureAdapter extends ILearningCapturePort {
  /**
   * @param {Array<ILearningCapturePort>} adapters
   */
  constructor(adapters) {
    super();
    this.adapters = adapters ?? [];
  }

  /**
   * @param {object} [opts]
   */
  async loadCaptureRecords(opts = {}) {
    const records = [];
    const files = [];

    for (const adapter of this.adapters) {
      const chunk = await adapter.loadCaptureRecords(opts);
      records.push(...(chunk.records ?? []));
      files.push(...(chunk.files ?? []));
    }

    return { records, files };
  }
}
