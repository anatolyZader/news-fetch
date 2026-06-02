import { loadAppConfig } from '../cross-cut-modules/config/loadConfig.js';
import { initTelemetry } from '../cross-cut-modules/observability/initTelemetry.js';
import {
  createInProcessMetricsPort,
  createTracingMetricsPort,
} from '../cross-cut-modules/monitoring/index.js';
import { repoRoot } from './paths.js';
import { registerPersistence } from './registerPersistence.js';
import { registerGeo } from './registerGeo.js';
import { registerIngestion } from './registerIngestion.js';
import { registerAnalysis } from './registerAnalysis.js';
import { registerPlatform } from './registerPlatform.js';
import { createMediaHelpers } from './registerMedia.js';

let wired = null;

/**
 * Application-wide wiring (singleton). Safe to call multiple times.
 */
export function wireApplication() {
  if (wired) return wired;

  const config = loadAppConfig();
  void initTelemetry();

  const metricsPort = createInProcessMetricsPort();
  const tracePort = createTracingMetricsPort({ metricsPort });

  const platform = registerPlatform();
  const persistence = registerPersistence({
    repoRoot,
    sqlitePath: config.sqlitePath,
    articleTimezone: config.timezone,
    tracePort,
    metricsPort,
  });
  const geo = registerGeo({
    repoRoot,
    sqlitePath: persistence.sqlitePath,
  });
  const ingestion = registerIngestion({
    repoRoot,
    retrievalService: persistence.retrievalService,
  });
  const analysis = registerAnalysis({
    repoRoot,
    sqlitePath: persistence.sqlitePath,
    evidenceStore: persistence.evidenceStore,
    sourceArchive: persistence.sourceArchive,
    retrievalService: persistence.retrievalService,
    poolService: ingestion.poolService,
  });
  const media = createMediaHelpers({
    repoRoot,
    sqlitePath: persistence.sqlitePath,
    retrievalService: persistence.retrievalService,
    evidenceStore: persistence.evidenceStore,
    sourceArchive: persistence.sourceArchive,
    geoService: geo.geoService,
    geoEnrichmentPort: geo.geoEnrichmentPort,
  });

  wired = {
    repoRoot,
    config,
    metricsPort,
    tracePort,
    ...platform,
    ...persistence,
    ...geo,
    ...ingestion,
    ...analysis,
    media,
  };
  return wired;
}

/** @param {ReturnType<typeof wireApplication>} w */
export function resetWireApplicationForTests() {
  wired = null;
}
