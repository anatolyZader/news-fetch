import { resolve } from 'path';

import {
  createGeoLocalityOverridesSqliteAdapter,
  createGeoNorthReferenceJsonAdapter,
  createGeoService,
  createGeoUnknownSqliteQueueAdapter,
} from '../../business_modules/geo/index.js';
import { createGeoUnknownJsonlSinkAdapter } from '../../business_modules/geo/infrastructure/adapters/geoUnknownJsonlSinkAdapter.js';
import { createGeoEnrichmentAdapter } from '../../business_modules/resilience/infrastructure/adapters/geoEnrichmentAdapter.js';

/**
 * @param {{ rootDir: string, unknownSourceType?: string, sqlitePath?: string }} opts
 * @returns {{ geoService: ReturnType<typeof createGeoService>, geoEnrichmentPort: ReturnType<typeof createGeoEnrichmentAdapter> }}
 */
export function createGeoWiring({ rootDir, unknownSourceType = 'app', sqlitePath }) {
  const dataDir = resolve(rootDir, 'business_modules', 'geo', 'data');
  const dbPath = sqlitePath ?? resolve(rootDir, 'data', 'app.sqlite');

  const geoOverridesPort =
    process.env.GEO_OVERRIDES_SQLITE === '1'
      ? createGeoLocalityOverridesSqliteAdapter({ dbPath })
      : null;

  const geoService = createGeoService({
    northReferencePort: createGeoNorthReferenceJsonAdapter({ dataDir }),
    overridesPort: geoOverridesPort,
  });

  const geoUnknownReviewSink =
    process.env.GEO_UNKNOWN_REVIEW_JSONL === '1'
      ? createGeoUnknownJsonlSinkAdapter({
          filePath: resolve(dataDir, 'review', 'unknown-localities.jsonl'),
        })
      : null;

  const geoUnknownReviewQueue =
    process.env.GEO_UNKNOWN_REVIEW_SQLITE === '1'
      ? createGeoUnknownSqliteQueueAdapter({ dbPath, sourceType: unknownSourceType })
      : null;

  const geoUnknownSink =
    geoUnknownReviewSink && geoUnknownReviewQueue
      ? {
          recordUnknown: (e) => {
            geoUnknownReviewSink.recordUnknown(e);
            geoUnknownReviewQueue.recordUnknown(e);
          },
        }
      : (geoUnknownReviewSink ?? geoUnknownReviewQueue);

  const geoEnrichmentPort = createGeoEnrichmentAdapter({ geoService, unknownSink: geoUnknownSink });

  return { geoService, geoEnrichmentPort };
}
