#!/usr/bin/env node
/**
 * Composition entry: wires geo + survey CLI without importing geo from resilience/.
 * @see business_modules/resilience/input/analyzeSurveyInput.js
 */
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  createGeoLocalityOverridesSqliteAdapter,
  createGeoNorthReferenceJsonAdapter,
  createGeoUnknownSqliteQueueAdapter,
  createGeoService,
} from '../business_modules/geo/index.js';
import { createGeoUnknownJsonlSinkAdapter } from '../business_modules/geo/infrastructure/adapters/geoUnknownJsonlSinkAdapter.js';
import { createGeoEnrichmentAdapter } from '../business_modules/resilience/infrastructure/adapters/geoEnrichmentAdapter.js';
import { runAnalyzeSurveyCli } from '../business_modules/resilience/input/analyzeSurveyInput.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, '..', 'business_modules', 'geo', 'data');

const geoOverridesPort =
  process.env.GEO_OVERRIDES_SQLITE === '1'
    ? createGeoLocalityOverridesSqliteAdapter({ dbPath: resolve(__dirname, '..', 'data', 'app.sqlite') })
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
    ? createGeoUnknownSqliteQueueAdapter({ dbPath: resolve(__dirname, '..', 'data', 'app.sqlite'), sourceType: 'survey' })
    : null;
const geoUnknownSink =
  geoUnknownReviewSink && geoUnknownReviewQueue
    ? { recordUnknown: (e) => { geoUnknownReviewSink.recordUnknown(e); geoUnknownReviewQueue.recordUnknown(e); } }
    : (geoUnknownReviewSink ?? geoUnknownReviewQueue);
const geoEnrichmentPort = createGeoEnrichmentAdapter({ geoService, unknownSink: geoUnknownSink });

runAnalyzeSurveyCli({ geoEnrichmentPort }).catch((err) => {
  console.error(err);
  process.exit(1);
});
