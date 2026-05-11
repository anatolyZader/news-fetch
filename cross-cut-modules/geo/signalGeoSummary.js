/**
 * Re-exports geo aggregation helpers for CLI/report code outside `business_modules/geo`
 * without wiring through DI (e.g. assess-signals).
 */
export {
  groupSignalsByDistanceBand,
  groupSignalsBySubregion,
  summarizeGeoCoverage,
} from '../../business_modules/geo/domain/services/geoAggregation.js';
export { collectGeoVersionsFromSignals } from '../../business_modules/geo/domain/services/geoReportDiagnostics.js';
export { validateGeoEnvelope } from '../../business_modules/geo/domain/value_objects/geoEnrichmentSchema.js';
