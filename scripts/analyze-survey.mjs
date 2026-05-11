#!/usr/bin/env node
/**
 * Composition entry: wires geo + survey CLI without importing geo from resilience/.
 * @see business_modules/resilience/input/analyzeSurveyInput.js
 */
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { createGeoNorthReferenceJsonAdapter, createGeoService } from '../business_modules/geo/index.js';
import { createGeoUnknownJsonlSinkAdapter } from '../business_modules/geo/infrastructure/adapters/geoUnknownJsonlSinkAdapter.js';
import { createGeoEnrichmentAdapter } from '../business_modules/resilience/infrastructure/adapters/geoEnrichmentAdapter.js';
import { runAnalyzeSurveyCli } from '../business_modules/resilience/input/analyzeSurveyInput.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, '..', 'business_modules', 'geo', 'data');

const geoService = createGeoService({
  northReferencePort: createGeoNorthReferenceJsonAdapter({ dataDir }),
});
const geoUnknownReviewSink =
  process.env.GEO_UNKNOWN_REVIEW_JSONL === '1'
    ? createGeoUnknownJsonlSinkAdapter({
        filePath: resolve(dataDir, 'review', 'unknown-localities.jsonl'),
      })
    : null;
const geoEnrichmentPort = createGeoEnrichmentAdapter({ geoService, unknownSink: geoUnknownReviewSink });

runAnalyzeSurveyCli({ geoEnrichmentPort }).catch((err) => {
  console.error(err);
  process.exit(1);
});
