/**
 * Canonical filesystem paths for pipeline ingest artifacts (relative to repo root).
 *
 * Pipeline position: STAGE-1 extract/ingest — maps source types and dates to
 * on-disk signal bundles and open-observation artifacts before assess loads them.
 *
 * Owns: absolute path builders for news/radio/whatsapp/social/visits/pbo bundles
 * and open-observation JSONL paths.
 * Does NOT: discover or load bundles (see `signalBundles.js`), write reports, or
 * run extraction.
 *
 * Key collaborators: `paths/repoRoot.js`, `contracts/index.js` (closedSignalsDir),
 * `open_observation_extraction/`, ingest CLIs under `app/pipeline/`.
 */

import { resolve } from 'node:path';
import { closedSignalsDir } from '../../contracts/index.js';
import { resolveRepoRoot } from './repoRoot.js';

// ---------------------------------------------------------------------------
// Closed signal bundle roots
// ---------------------------------------------------------------------------

/**
 * Directory holding closed-catalogue signal JSON bundles for a pipeline run.
 * @param {string} [rootDir]
 * @returns {string}
 */
export function pipelineSignalsDir(rootDir) {
  return closedSignalsDir({
    signalsDir: resolve(resolveRepoRoot(rootDir), 'business_modules/resilience_scorer/data/signals'),
  });
}

// ---------------------------------------------------------------------------
// Per-source ingest paths
// ---------------------------------------------------------------------------

/**
 * Extracted news articles markdown for a given date.
 * @param {string} date YYYY-MM-DD
 * @param {string} [rootDir]
 * @returns {string}
 */
export function newsArticlesPath(date, rootDir) {
  return resolve(resolveRepoRoot(rootDir), `business_modules/news-sites/articles_extracted/articles-homefront-${date}.md`);
}

/**
 * Closed news signal bundle path for a given date.
 * @param {string} date YYYY-MM-DD
 * @param {string} [rootDir]
 * @returns {string}
 */
export function newsSignalsPath(date, rootDir) {
  return resolve(pipelineSignalsDir(rootDir), `signals-news-${date}.json`);
}

/**
 * Closed radio signal bundle path for a given date.
 * @param {string} date YYYY-MM-DD
 * @param {string} [rootDir]
 * @returns {string}
 */
export function radioSignalsPath(date, rootDir) {
  return resolve(pipelineSignalsDir(rootDir), `signals-radio-${date}.json`);
}

/**
 * WhatsApp daily report markdown for a given date.
 * @param {string} date YYYY-MM-DD
 * @param {string} [rootDir]
 * @returns {string}
 */
export function whatsappReportPath(date, rootDir) {
  return resolve(resolveRepoRoot(rootDir), `business_modules/whatsapp/reports/whatsapp_reports-${date}.md`);
}

/**
 * Closed WhatsApp signal bundle path for a given date.
 * @param {string} date YYYY-MM-DD
 * @param {string} [rootDir]
 * @returns {string}
 */
export function whatsappSignalsPath(date, rootDir) {
  return resolve(pipelineSignalsDir(rootDir), `signals-whatsapp-${date}.json`);
}

/**
 * Social signal bundle path (lives outside closed signals dir).
 * @param {string} date YYYY-MM-DD
 * @param {string} [rootDir]
 * @returns {string}
 */
export function socialSignalsPath(date, rootDir) {
  return resolve(resolveRepoRoot(rootDir), `business_modules/social_media/data/signals-social-${date}.json`);
}

/**
 * Field visits signal bundle path for a given date.
 * @param {string} date YYYY-MM-DD
 * @param {string} [rootDir]
 * @returns {string}
 */
export function visitsSignalsPath(date, rootDir) {
  return resolve(resolveRepoRoot(rootDir), `business_modules/visits/data/signals/signals-visits-${date}.json`);
}

/**
 * Legacy on-disk stem (pre field→visits rewrite); prefer `visitsSignalsPath`.
 * @param {string} date YYYY-MM-DD
 * @param {string} [rootDir]
 * @returns {string}
 */
export function legacyFieldSignalsPath(date, rootDir) {
  return resolve(resolveRepoRoot(rootDir), `business_modules/visits/data/signals/signals-field-${date}.json`);
}

/** @deprecated use visitsSignalsPath */
export const fieldSignalsPath = visitsSignalsPath;

/**
 * PBO signal bundle path for a given date.
 * @param {string} date YYYY-MM-DD
 * @param {string} [rootDir]
 * @returns {string}
 */
export function pboSignalsPath(date, rootDir) {
  return resolve(pipelineSignalsDir(rootDir), `signals-pbo-${date}.json`);
}

/**
 * Regional PBO signal bundle path for a given date.
 * @param {string} date YYYY-MM-DD
 * @param {string} [rootDir]
 * @returns {string}
 */
export function pboRegionalSignalsPath(date, rootDir) {
  return resolve(pipelineSignalsDir(rootDir), `signals-pbo_regional-${date}.json`);
}

/**
 * Directory globbed for visits/field report inputs.
 * @param {string} [rootDir]
 * @returns {string}
 */
export function visitsReportsGlobDir(rootDir) {
  return resolve(resolveRepoRoot(rootDir), 'business_modules/visits/data');
}

/** @deprecated use visitsReportsGlobDir */
export const fieldReportsGlobDir = visitsReportsGlobDir;

/**
 * Regional PBO raw data directory.
 * @param {string} [rootDir]
 * @returns {string}
 */
export function regionalPboDataDir(rootDir) {
  return resolve(resolveRepoRoot(rootDir), 'business_modules/pbo_report/data/regional');
}

// ---------------------------------------------------------------------------
// Open observations (oov family)
// ---------------------------------------------------------------------------

/**
 * Root directory for parallel open-vocabulary observation artifacts.
 * @param {string} [rootDir]
 * @returns {string}
 */
export function pipelineOpenObservationsDataDir(rootDir) {
  return resolve(resolveRepoRoot(rootDir), 'business_modules/open_observation_extraction/data');
}

/**
 * Open-observation JSON artifact path for a source type and date.
 * @param {string} sourceType
 * @param {string} date YYYY-MM-DD
 * @param {string} [rootDir]
 * @returns {string}
 */
export function pipelineOpenObservationsPath(sourceType, date, rootDir) {
  const safe = String(sourceType ?? 'adhoc').replaceAll(/[^a-z0-9_-]/gi, '_');
  return resolve(pipelineOpenObservationsDataDir(rootDir), `observations-pipeline-${safe}-${date}.json`);
}
