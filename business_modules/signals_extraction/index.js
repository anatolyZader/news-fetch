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
export { normalizeObservations } from './domain/services/observationSchema.js';
export { routeOpenObservations } from './domain/services/openObservationRouter.js';
export { normalizeExtractUnits } from './domain/services/extractUnitSchema.js';
export { isOpenPipelineExtractEnabled } from './domain/services/openPipelineConfig.js';
export { runPipelineOpenExtract } from './app/pipelineOpenExtractService.js';
