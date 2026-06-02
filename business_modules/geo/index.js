export { createGeoService } from './app/geoService.js';
export { normalizeLocalityLookupKey } from './domain/services/resolveLocalityMatch.js';
export { createGeoNorthReferenceJsonAdapter } from './infrastructure/adapters/geoNorthReferenceJsonAdapter.js';
export {
  NORTH_SUBREGION_IDS,
  NORTH_SUBREGION_ID_SET,
  isNorthSubregionId,
  isGolanSubregionId,
} from './domain/value_objects/northSubregionId.js';
export { isGeoResolved } from './domain/value_objects/geoEnrichment.js';
export { distanceBandForKm } from './domain/services/distanceBand.js';
export { haversineKm } from './domain/services/haversineKm.js';
export { distanceKmToPolyline, approximateKmPointToSegment } from './domain/services/distanceKmToPolyline.js';
export {
  groupSignalsByDistanceBand,
  groupSignalsBySubregion,
  summarizeGeoCoverage,
  summarizeGeoQuality,
} from './domain/services/geoAggregation.js';
export { geoAreaTagsForPboSubregion } from './domain/services/geoAreaTagsForPboSubregion.js';
export { registerGeoRoutes } from './input/geoRoutes.js';
export { validateGeoEnvelope } from './domain/value_objects/geoEnrichmentSchema.js';
export {
  deriveGeoQualityFields,
  deriveScopeConfidence,
  GEO_POLICY_VERSION,
  FUZZY_METRICS_MIN_CONFIDENCE,
} from './domain/services/geoQualityPolicy.js';
export { collectGeoVersionsFromSignals } from './domain/services/geoReportDiagnostics.js';
export { createGeoUnknownJsonlSinkAdapter } from './infrastructure/adapters/geoUnknownJsonlSinkAdapter.js';
export { createGeoLocalityOverridesSqliteAdapter } from './infrastructure/adapters/geoLocalityOverridesSqliteAdapter.js';
export { createGeoUnknownSqliteQueueAdapter } from './infrastructure/adapters/geoUnknownSqliteQueueAdapter.js';
export {
  GEO_PROVENANCE,
  TEXT_INFERENCE_SOURCE_TYPES,
} from './domain/value_objects/geoProvenance.js';
export { northRelevanceFromResolvedGeo } from './domain/services/northRelevanceFromResolvedGeo.js';
export { collectRawLocalitiesFromNorthReferenceDoc } from './domain/services/northReferenceDocShape.js';
