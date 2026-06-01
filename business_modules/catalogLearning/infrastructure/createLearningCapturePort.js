/**
 * Default composite capture port (OOV JSONL + open observation bundles).
 */
import { LearningCaptureFsAdapter } from './adapters/learningCaptureFsAdapter.js';
import { ObservationCaptureAdapter } from './adapters/observationCaptureAdapter.js';
import { CompositeLearningCaptureAdapter } from './adapters/compositeLearningCaptureAdapter.js';

/**
 * @param {{ reportsDir?: string, observationDataDir?: string }} [opts]
 */
export function createDefaultLearningCapturePort(opts = {}) {
  return new CompositeLearningCaptureAdapter([
    new LearningCaptureFsAdapter({ reportsDir: opts.reportsDir }),
    new ObservationCaptureAdapter({ dataDir: opts.observationDataDir }),
  ]);
}
