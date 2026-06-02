import { createGeoWiring } from '../cross-cut-modules/geo/createGeoWiring.js';
import { createGeoUnknownReviewService } from '../business_modules/geo/app/geoUnknownReviewService.js';

/**
 * @param {{ repoRoot: string, sqlitePath: string }} opts
 */
export function registerGeo(opts) {
  const { geoService, geoEnrichmentPort, geoUnknownReviewQueue } = createGeoWiring({
    rootDir: opts.repoRoot,
    unknownSourceType: 'whatsapp',
    sqlitePath: opts.sqlitePath,
  });

  const geoUnknownReviewService = createGeoUnknownReviewService({
    queueAdapter: geoUnknownReviewQueue,
  });

  return {
    geoService,
    geoEnrichmentPort,
    geoUnknownReviewQueue,
    geoUnknownReviewService,
  };
}
