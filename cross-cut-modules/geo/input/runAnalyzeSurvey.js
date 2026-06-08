#!/usr/bin/env node
/**
 * Composition entry: wires geo + survey CLI without importing geo from resilience/.
 * @see business_modules/resilience/input/analyzeSurveyInput.js
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGeoWiring } from '../createGeoWiring.js';
import { runAnalyzeSurveyCli } from '../../../business_modules/resilience/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../../..');

const { geoEnrichmentPort } = createGeoWiring({
  rootDir,
  unknownSourceType: 'survey',
  sqlitePath: resolve(rootDir, 'db', 'app.sqlite'),
});

runAnalyzeSurveyCli({ geoEnrichmentPort }).catch((err) => {
  console.error(err);
  process.exit(1);
});
