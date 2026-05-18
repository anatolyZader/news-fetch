#!/usr/bin/env node
/**
 * Composition entry: wires geo + survey CLI without importing geo from resilience/.
 * @see business_modules/resilience/input/analyzeSurveyInput.js
 */
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { createGeoWiring } from '../cross-cut-modules/geo/createGeoWiring.js';
import { runAnalyzeSurveyCli } from '../business_modules/resilience/input/analyzeSurveyInput.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const { geoEnrichmentPort } = createGeoWiring({
  rootDir,
  unknownSourceType: 'survey',
  sqlitePath: resolve(rootDir, 'data', 'app.sqlite'),
});

runAnalyzeSurveyCli({ geoEnrichmentPort }).catch((err) => {
  console.error(err);
  process.exit(1);
});
