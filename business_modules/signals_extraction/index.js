/**
 * Public facade for signals_extraction module.
 */
export { defaultClosedSignalsDir, defaultSignalsExtractionDataDir } from './infrastructure/signalsDataPaths.js';
export {
  createSignalsExtractionService,
  createDefaultSignalsExtractionService,
} from './app/signalsExtractionService.js';
export { createObservationBundleService } from './app/observationBundleService.js';
export { ObservationFsAdapter } from './infrastructure/adapters/observationFsAdapter.js';
