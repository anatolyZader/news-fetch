/**
 * Re-exports geo aggregation helpers for CLI/report code outside `business_modules/geo`
 * without wiring through DI (e.g. assess-signals).
 */
export {
  groupSignalsByDistanceBand,
  groupSignalsBySubregion,
  summarizeGeoCoverage,
  summarizeGeoQuality,
  collectGeoVersionsFromSignals,
  validateGeoEnvelope,
} from '../../business_modules/geo/index.js';
